import { isAccent, isAccentColor } from "../../appearance";
import {
	LMAX_REMINDER_MESSAGE_LENGTH,
	LMAX_TASK_INFORMATION_LENGTH,
	LMAX_TASK_LABEL_LENGTH,
} from "little-shared/constants";
import {
	originKeyFor,
	urlKeyFor,
	type ContentKeys,
} from "little-shared/utils/envelope";
import type { Escalation } from "little-shared/utils/schedule";
import {
	BackupError,
	decodeHeader,
	openBackupKey,
	openChunk,
} from "../../storage/backup";
import {
	importProfileKeys,
	sealAsset,
	sealBody,
	type ProfileKeys,
} from "../../storage/keys";
import { newProfile, removeProfileRows } from "../../storage/profiles";
import {
	defaultSettings,
	MAX_CHAT_TEXT,
	type ChatContent,
	type ChatMessageContent,
	type Settings,
} from "../../storage/repositories";
import type {
	AssetRow,
	ChatMessageRow,
	ChatRow,
	ImageRow,
	LinkRow,
	LittleDB,
	NoteRow,
	Privacy,
	ProfileRow,
	ReminderRow,
	SaveRow,
	TaskRow,
} from "../../storage/schema";
import { normalizeTags } from "../../utils/tags";
import { ALLOWED_IMAGE_MIME_TYPES } from "./images";
import { toBase64 } from "../../storage/session";
import { asStoredAIOutput } from "./chats";
import {
	AVATAR_TYPES,
	MAX_AUTO_LOCK_MINUTES,
	MAX_AVATAR_BYTES,
	asProfileName,
} from "./profiles";
import { asBoolean, asRecord, asString, defineCommand } from "./registry";
import { asWebUrl } from "./saves";
import { asMisc } from "./settings";
import { asPriority, asSchedule, occurrenceDate } from "./tasks";

// Importing a backup (decision 0010, Backups) into a new profile. The page
// drives it one staged chunk per command, so the worker stays awake while
// messages arrive and other commands run between chunks (0012, Jobs).
//
// What the import needs between chunks (the backup key, the new profile's
// keys, the id seed) lives only in this worker's memory: if the worker
// stops, the import is lost, and the job row tells the next start to
// delete what was written. The profile row is written with the last
// chunk, so the lock screen never lists a half-imported profile.

type ImportJob = {
	profileId: string;
	backupId: string;
	backupKeys: ContentKeys;
	keys: ProfileKeys;
	seed: CryptoKey;
	profile: ProfileRow;
	avatar: Blob | null;
	sawProfile: boolean;
	next: number;
	// Links left out because the file has no record at one end.
	skippedLinks: number;
};

const imports = new Map<string, ImportJob>();

const damaged = (): never => {
	throw new BackupError("This backup is damaged.");
};

// Deletes what imports cut off by a stopped worker or a closed page wrote.
// Runs at worker start, and before a new import begins.
export const cleanUpImports = async (db: LittleDB): Promise<void> => {
	for (const job of await db.jobs.toArray()) {
		if (job.kind === "import") {
			await removeProfileRows(db, job.profileId);
			await db.jobs.delete(job.id);
		}
	}
	imports.clear();
};

// A new id for an old one: HMAC-SHA-256 under the import's random seed,
// laid out as a version 8 UUID. Links and assets keep pointing at the
// right rows across chunks without an id map (0010).
const newId = async (seed: CryptoKey, oldId: string): Promise<string> => {
	const mac = new Uint8Array(
		await crypto.subtle.sign("HMAC", seed, new TextEncoder().encode(oldId)),
	).slice(0, 16);
	mac[6] = (mac[6] & 0x0f) | 0x80;
	mac[8] = (mac[8] & 0x3f) | 0x80;
	const hex = Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// Backup content is untrusted: whoever made the file chose it.
const MAX_TEXT = 100_000;

const record = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: damaged();

const text = (value: unknown, max = MAX_TEXT): string =>
	typeof value === "string" && value.length <= max ? value : damaged();

const instant = (value: unknown): number =>
	Number.isSafeInteger(value) && (value as number) >= 0
		? (value as number)
		: damaged();

const flag = (value: unknown): 0 | 1 =>
	typeof value === "boolean" ? (value ? 1 : 0) : damaged();

const privacy = (value: unknown): Privacy =>
	value === "private" || value === "public" ? value : damaged();

const bytes = (value: unknown): Uint8Array =>
	value instanceof Uint8Array ? value : damaged();

const escalation = (value: unknown): Escalation | null => {
	if (value === null) {
		return null;
	}
	const { escalate, stopBefore } = record(value);
	return escalate === true &&
		Number.isInteger(stopBefore) &&
		(stopBefore as number) >= 0 &&
		(stopBefore as number) <= 24 * 60
		? { escalate: true, stopBefore: stopBefore as number }
		: damaged();
};

// Command-input parsers throw on bad values; here those mean a damaged
// backup.
const parsed = <T>(parse: () => T): T => {
	try {
		return parse();
	} catch {
		return damaged();
	}
};

type Rows = {
	chats: Array<ChatRow>;
	chatMessages: Array<ChatMessageRow>;
	saves: Array<SaveRow>;
	notes: Array<NoteRow>;
	images: Array<ImageRow>;
	tasks: Array<TaskRow>;
	reminders: Array<ReminderRow>;
	links: Array<LinkRow>;
	assets: Array<AssetRow>;
	settings: Array<{ misc: Settings["misc"] }>;
};

const importTags = (value: unknown): Array<string> =>
	Array.isArray(value)
		? normalizeTags(
				value.filter(
					(item): item is string => typeof item === "string",
				),
			)
		: [];

const addEntry = async (
	job: ImportJob,
	rows: Rows,
	value: unknown,
	zone: string,
): Promise<void> => {
	const entry = record(value);
	const { keys, seed, profileId } = job;
	const base = async () => {
		const id = await newId(seed, text(entry.id));
		return {
			id,
			profileId,
			createdAt: instant(entry.createdAt),
			updatedAt: instant(entry.updatedAt),
		};
	};
	switch (entry.table) {
		case "profile": {
			if (job.sawProfile) {
				damaged();
			}
			job.sawProfile = true;
			const prefs = record(entry.prefs);
			const autoLockMinutes = prefs.autoLockMinutes;
			job.profile = {
				...job.profile,
				name: parsed(() => asProfileName(entry.name)),
				prefs: {
					theme:
						prefs.theme === "light" || prefs.theme === "dark"
							? prefs.theme
							: "system",
					...(isAccent(prefs.accent) ? { accent: prefs.accent } : {}),
					...(isAccentColor(prefs.accentColor)
						? { accentColor: prefs.accentColor }
						: {}),
					// Older backups allowed longer; they get the longest
					// Chrome honours.
					autoLockMinutes:
						Number.isInteger(autoLockMinutes) &&
						(autoLockMinutes as number) >= 1
							? Math.min(
									autoLockMinutes as number,
									MAX_AUTO_LOCK_MINUTES,
								)
							: job.profile.prefs.autoLockMinutes,
				},
			};
			if (entry.avatar !== null) {
				const avatar = record(entry.avatar);
				const image = bytes(avatar.bytes);
				const type = text(avatar.type, 100);
				job.avatar =
					AVATAR_TYPES.includes(type) &&
					image.length > 0 &&
					image.length <= MAX_AVATAR_BYTES
						? new Blob([image.slice()], { type })
						: null;
			}
			return;
		}
		case "settings": {
			const misc = parsed(() => asMisc(entry.misc));
			// Local-device backup timestamp and external MCP access do not
			// carry over automatically to a newly imported profile.
			delete misc.lastBackupAt;
			delete misc.externalMcpMode;
			rows.settings.push({ misc });
			return;
		}
		case "saves": {
			const row = await base();
			const content = record(entry.content);
			const url = parsed(() => asWebUrl(content.url));
			const tags = importTags(content.tags);
			const snapshot =
				typeof content.snapshot === "string"
					? content.snapshot.trim().slice(0, 15_000)
					: "";
			rows.saves.push({
				...row,
				...(await sealBody(keys, "saves", row.id, {
					url,
					title: text(content.title),
					customName: text(content.customName),
					...(content.provisional === true
						? { provisional: true as const }
						: {}),
					...(content.archived === true ? { archived: true } : {}),
					...(tags.length > 0 ? { tags } : {}),
					...(snapshot !== "" ? { snapshot } : {}),
				})),
				urlKey: await urlKeyFor(keys.index, url),
				originKey: await originKeyFor(keys.index, url),
				saved: flag(entry.saved),
				browsed: flag(entry.browsed),
				browsedAt: instant(entry.browsedAt),
				privacy: privacy(entry.privacy),
			});
			return;
		}
		case "notes": {
			const row = await base();
			const content = record(entry.content);
			const tags = importTags(content.tags);
			const title =
				typeof content.title === "string"
					? content.title.trim().slice(0, 100)
					: "";
			rows.notes.push({
				...row,
				...(await sealBody(keys, "notes", row.id, {
					content: text(content.content),
					...(content.locked === true ? { locked: true } : {}),
					...(title !== "" ? { title } : {}),
					...(tags.length > 0 ? { tags } : {}),
				})),
				privacy: privacy(entry.privacy),
			});
			return;
		}
		case "images": {
			const row = await base();
			const content = record(entry.content);
			const mimeType = text(content.mimeType, 100).toLowerCase();
			if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
				damaged();
			}
			const tags = importTags(content.tags);
			const sourceUrl =
				typeof content.sourceUrl === "string" &&
				content.sourceUrl.trim() !== ""
					? parsed(() => asWebUrl(content.sourceUrl))
					: undefined;
			rows.images.push({
				...row,
				...(await sealBody(keys, "images", row.id, {
					title: text(content.title, 120),
					mimeType,
					...(sourceUrl ? { sourceUrl } : {}),
					...(tags.length > 0 ? { tags } : {}),
				})),
				privacy: privacy(entry.privacy),
			});
			return;
		}
		case "tasks": {
			const row = await base();
			const content = record(entry.content);
			const schedule = parsed(() => asSchedule(entry.schedule));
			const dueAt = instant(entry.dueAt);
			const tags = importTags(content.tags);
			rows.tasks.push({
				...row,
				...(await sealBody(keys, "tasks", row.id, {
					information: text(
						content.information,
						LMAX_TASK_INFORMATION_LENGTH,
					),
					label: text(content.label, LMAX_TASK_LABEL_LENGTH),
					priority: parsed(() => asPriority(content.priority)),
					...(tags.length > 0 ? { tags } : {}),
				})),
				schedule,
				dueAt,
				occursOn:
					schedule.kind !== "recurring"
						? null
						: entry.occursOn === undefined
							? // Written before backups carried it.
								occurrenceDate(schedule.rule, dueAt, zone)
							: parsed(() =>
									Temporal.PlainDate.from(
										text(entry.occursOn, 10),
									).toString(),
								),
				done: flag(entry.done),
				finishedAt: instant(entry.finishedAt),
				privacy: privacy(entry.privacy),
			});
			return;
		}
		case "reminders": {
			const row = await base();
			const content = record(entry.content);
			const tags = importTags(content.tags);
			rows.reminders.push({
				...row,
				...(await sealBody(keys, "reminders", row.id, {
					message: text(
						content.message,
						LMAX_REMINDER_MESSAGE_LENGTH,
					),
					...(tags.length > 0 ? { tags } : {}),
				})),
				target: instant(entry.target),
				escalation: escalation(entry.escalation),
				lastFiredAt: instant(entry.lastFiredAt),
				nextFireAt: instant(entry.nextFireAt),
				privacy: privacy(entry.privacy),
			});
			return;
		}
		case "links":
			rows.links.push({
				id: await newId(seed, text(entry.id)),
				profileId,
				fromId: await newId(seed, text(entry.fromId)),
				toId: await newId(seed, text(entry.toId)),
				createdAt: instant(entry.createdAt),
			});
			return;
		case "assets": {
			const row = await base();
			rows.assets.push({
				...row,
				...(await sealAsset(keys, row.id, bytes(entry.bytes))),
				ownerId: await newId(seed, text(entry.ownerId)),
				kind: text(entry.kind, 100),
			});
			return;
		}
		case "chats": {
			const row = await base();
			rows.chats.push({
				...row,
				...(await sealBody<ChatContent>(keys, "chats", row.id, {
					title: text(record(entry.content).title, 120),
					...(record(entry.content).named === true
						? { named: true as const }
						: {}),
				})),
			});
			return;
		}
		case "chatMessages": {
			const row = await base();
			const content = record(entry.content);
			// Only the shapes LittleAI stores; anything else is damage.
			const message: ChatMessageContent =
				content.role === "user"
					? {
							role: "user",
							text: text(content.text, MAX_CHAT_TEXT),
							// The attached page's title and address, if any.
							...(content.page
								? {
										page: {
											title: text(
												record(content.page).title,
												300,
											),
											url: parsed(() =>
												asWebUrl(
													record(content.page).url,
												),
											),
										},
									}
								: {}),
						}
					: content.role === "assistant"
						? {
								role: "assistant",
								output: parsed(() =>
									asStoredAIOutput(content.output),
								),
							}
						: damaged();
			rows.chatMessages.push({
				...row,
				chatId: await newId(seed, text(entry.chatId)),
				...(await sealBody<ChatMessageContent>(
					keys,
					"chatMessages",
					row.id,
					message,
				)),
			});
			return;
		}
		default:
			damaged();
	}
};

const SEED_LENGTH = 32;

// Opens the backup with its password and starts a new profile protected by
// the same password. The header is staged as it is.
export const backupImportBegin = defineCommand({
	name: "backup.importBegin",
	parse: (input) => {
		const record = asRecord(input);
		return {
			header: asString(record.header, "header"),
			password: asString(record.password, "password"),
		};
	},
	run: async (ctx, input) => {
		const header = decodeHeader(await ctx.staging.take(input.header));
		const backupKeys = await openBackupKey(header, input.password);
		// One import at a time: one left by a closed page goes now.
		await cleanUpImports(ctx.db);
		const now = ctx.now();
		const { row, root, indexKey } = await newProfile({
			name: "Imported profile",
			password: input.password,
			now,
		});
		const keys = await importProfileKeys({
			profileId: row.id,
			currentKeyId: row.currentKeyId,
			rootKeys: { [row.currentKeyId]: toBase64(root) },
			indexKey: toBase64(indexKey),
		});
		const seed = await crypto.subtle.importKey(
			"raw",
			crypto.getRandomValues(new Uint8Array(SEED_LENGTH)),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);
		const jobId = crypto.randomUUID();
		await ctx.db.jobs.add({
			id: jobId,
			kind: "import",
			profileId: row.id,
			state: "running",
			startedAt: now,
		});
		imports.set(jobId, {
			profileId: row.id,
			backupId: header.backupId,
			backupKeys,
			keys,
			seed,
			profile: row,
			avatar: null,
			sawProfile: false,
			next: 0,
			skippedLinks: 0,
		});
		return { jobId };
	},
});

// Imports the next chunk, in file order. The chunk that says it is the
// last also stores the profile, which ends the job.
export const backupImportChunk = defineCommand({
	name: "backup.importChunk",
	parse: (input) => {
		const record = asRecord(input);
		return {
			jobId: asString(record.jobId, "jobId"),
			chunk: asString(record.chunk, "chunk"),
			...(record.more !== undefined
				? { more: asBoolean(record.more, "more") }
				: {}),
		};
	},
	run: async (ctx, input) => {
		const job = imports.get(input.jobId);
		if (!job || !(await ctx.db.jobs.get(input.jobId))) {
			await ctx.staging.discard(input.chunk);
			throw new BackupError("The import was interrupted. Try again.");
		}
		const { last, entries } = await openChunk(
			job.backupKeys,
			job.backupId,
			job.next,
			await ctx.staging.take(input.chunk),
		);
		if (last && input.more) {
			damaged();
		}
		const rows: Rows = {
			chats: [],
			chatMessages: [],
			saves: [],
			notes: [],
			images: [],
			tasks: [],
			reminders: [],
			links: [],
			assets: [],
			settings: [],
		};
		for (const entry of entries) {
			await addEntry(job, rows, entry, ctx.zone());
		}
		if (last && !job.sawProfile) {
			damaged();
		}
		// AI settings start at their defaults (decision 0007, A16).
		const settings = await Promise.all(
			rows.settings.map(({ misc }) =>
				sealBody<Settings>(job.keys, "settings", job.profileId, {
					ai: defaultSettings().ai,
					misc,
				}),
			),
		);
		const db = ctx.db;
		await db.transaction(
			"rw",
			[
				db.saves,
				db.notes,
				db.images,
				db.tasks,
				db.reminders,
				db.links,
				db.assets,
				db.settings,
				db.profiles,
				db.avatars,
				db.jobs,
				db.chats,
				db.chatMessages,
			],
			async () => {
				await db.chats.bulkAdd(rows.chats);
				// A message whose chat the file doesn't hold is left out.
				for (const message of rows.chatMessages) {
					if ((await db.chats.get(message.chatId)) !== undefined) {
						await db.chatMessages.add(message);
					}
				}
				await db.saves.bulkAdd(rows.saves);
				await db.notes.bulkAdd(rows.notes);
				await db.images.bulkAdd(rows.images);
				await db.tasks.bulkAdd(rows.tasks);
				await db.reminders.bulkAdd(rows.reminders);
				// Records come before links and assets in a backup, so both
				// ends of a link are already stored. A backup can still name
				// a record it does not hold (one made while the profile was
				// being edited, before exports read a consistent snapshot):
				// such links and assets are left out, never stored dangling.
				const held = async (id: string) =>
					(await db.saves.get(id)) !== undefined ||
					(await db.notes.get(id)) !== undefined ||
					(await db.images.get(id)) !== undefined ||
					(await db.tasks.get(id)) !== undefined ||
					(await db.reminders.get(id)) !== undefined;
				for (const link of rows.links) {
					if ((await held(link.fromId)) && (await held(link.toId))) {
						await db.links.add(link);
					} else {
						job.skippedLinks += 1;
					}
				}
				for (const asset of rows.assets) {
					if (await held(asset.ownerId)) {
						await db.assets.add(asset);
					}
				}
				for (const sealed of settings) {
					const now = ctx.now();
					await db.settings.put({
						id: job.profileId,
						profileId: job.profileId,
						...sealed,
						createdAt: now,
						updatedAt: now,
					});
				}
				if (last) {
					await db.profiles.add(job.profile);
					if (job.avatar) {
						await db.avatars.put({
							profileId: job.profileId,
							image: job.avatar,
						});
					}
					await db.jobs.delete(input.jobId);
				}
			},
		);
		job.next += 1;
		if (last) {
			imports.delete(input.jobId);
		}
		return {
			done: last,
			profileId: job.profileId,
			skippedLinks: job.skippedLinks,
		};
	},
});

// Removes what a failed or cancelled import wrote.
export const backupImportAbort = defineCommand({
	name: "backup.importAbort",
	parse: (input) => ({ jobId: asString(asRecord(input).jobId, "jobId") }),
	run: async (ctx, input) => {
		const job = await ctx.db.jobs.get(input.jobId);
		imports.delete(input.jobId);
		if (job) {
			await removeProfileRows(ctx.db, job.profileId);
			await ctx.db.jobs.delete(job.id);
		}
		return null;
	},
});
