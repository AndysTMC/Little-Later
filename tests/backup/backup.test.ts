// @vitest-environment node
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAI_PROVIDERS } from "little-shared/enums";
import { newKdfParams } from "little-shared/utils/envelope";
import { cleanUpImports } from "../../src/background/commands/backup";
import {
	readLinks,
	readNotes,
	readPreview,
	readProfile,
	readReminders,
	readSaves,
	readSettings,
	readTasks,
	unlockedKeys,
} from "../../src/services/ai/records";
import {
	createBackup,
	createReadableExport,
	importBackup,
} from "../../src/services/backup";
import {
	BACKUP_FORMAT,
	backupFileParts,
	readBackupFile,
	writeBackupFile,
} from "../../src/storage/backup";
import { littleDB } from "../../src/storage/pageDB";
import { putPreview } from "../../src/storage/repositories";
import { sessionStore } from "../../src/storage/session";
import { staging } from "../../src/storage/staging";
import { send } from "../../src/utils/send";

// Backups (decision 0010, Backups): export in the page, import in the
// worker's commands, which outside production run in the same context.

const PASSWORD = "correct-horse-battery";
const cheap = () => newKdfParams(1_000);
const DAY = 24 * 60 * 60 * 1000;

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

const reset = async () => {
	await sessionStore.clear();
	await cleanUpImports(littleDB);
	await Promise.all(littleDB.tables.map((table) => table.clear()));
};

// A profile with one of everything, linked the way the app links them.
const seedProfile = async (password: string | null = null) => {
	await send("profile.create", { name: "Ada", password });
	await send("profile.update", { theme: "dark", autoLockMinutes: 45 });
	await send("profile.setAvatar", {
		file: await staging.put(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
		type: "image/png",
	});
	await send("settings.update", {
		ai: {
			provider: LAI_PROVIDERS.CUSTOM,
			baseUrl: "http://attacker.example/v1",
			apiKey: "sk-secret",
			model: "evil",
		},
		misc: { VBMLimit: 1500, VBMSameOriginLimit: 3 },
	});
	const save = await send("save.capture", {
		url: "https://example.com/page#part",
		title: "Example",
		saved: true,
	});
	await send("save.update", { id: save.id, customName: "My example" });
	await send("save.capture", {
		url: "https://history.example/",
		title: "Visited",
	});
	await putPreview(
		littleDB,
		await unlockedKeys(),
		save.id,
		new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
		Date.now(),
	);
	await send("note.create", { content: "About example", saveId: save.id });
	const task = await send("task.create", {
		information: "Read example",
		label: "Reading",
		priority: "high",
		schedule: { kind: "due", at: Date.now() + DAY },
		reminder: "escalating",
		saveId: save.id,
	});
	await send("task.create", {
		information: "Water plants",
		schedule: {
			kind: "recurring",
			rule: {
				freq: "weekly",
				interval: 1,
				byWeekday: [1],
				time: "09:00",
				anchor: "2026-10-26",
				zone: "floating",
			},
		},
		reminder: null,
	});
	const done = await send("task.create", {
		information: "Old chore",
		schedule: { kind: "anytime" },
		reminder: null,
	});
	await send("task.complete", { id: done.id });
	await send("reminder.create", {
		message: "Call Bob",
		target: Date.now() + 2 * DAY,
	});
	return { saveId: save.id, taskId: task.id };
};

// Everything a profile holds, without ids, in a stable order, with links
// as content pairs: what must survive a backup unchanged.
const snapshot = async () => {
	const keys = await unlockedKeys();
	const [saves, notes, tasks, reminders, links, profile, settings] =
		await Promise.all([
			readSaves(keys),
			readNotes(keys),
			readTasks(keys),
			readReminders(keys),
			readLinks(keys),
			readProfile(keys),
			readSettings(keys),
		]);
	const labelOf = new Map<string, string>([
		...saves.map((s) => [s.id, `save:${s.url}`] as const),
		...notes.map((n) => [n.id, `note:${n.content}`] as const),
		...tasks.map((t) => [t.id, `task:${t.information}`] as const),
		...reminders.map((r) => [r.id, `reminder:${r.message}`] as const),
	]);
	const strip = <T extends { id: string }>(rows: Array<T>) =>
		rows
			.map((row) => ({ ...row, id: undefined }))
			.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
	const preview = await Promise.all(
		saves.map(async (save) => {
			const blob = await readPreview(keys, save.id);
			return blob ? [save.url, [...(await bytesOf(blob))]] : null;
		}),
	);
	const avatar = await littleDB.avatars.get(keys.profileId);
	return {
		profile: { name: profile.name, prefs: profile.prefs },
		avatar: avatar
			? {
					type: avatar.image.type,
					bytes: [...(await bytesOf(avatar.image))],
				}
			: null,
		misc: settings.misc,
		saves: strip(saves),
		notes: strip(notes),
		tasks: strip(tasks),
		reminders: strip(reminders),
		links: links
			.map(
				(link) =>
					`${labelOf.get(link.fromId)} -> ${labelOf.get(link.toId)}`,
			)
			.sort(),
		previews: preview.filter((entry) => entry !== null),
	};
};

const importedProfileIds = async (except: string) =>
	(await littleDB.profiles.toArray())
		.map((profile) => profile.id)
		.filter((id) => id !== except);

const rowCounts = async () =>
	Object.fromEntries(
		await Promise.all(
			littleDB.tables.map(
				async (table) => [table.name, await table.count()] as const,
			),
		),
	);

describe("backups", { timeout: 30_000 }, () => {
	beforeEach(reset);

	it("restores every record, link, preview and avatar into a new profile", async () => {
		await seedProfile();
		const original = await snapshot();
		const sourceId = (await unlockedKeys()).profileId;
		const backup = await createBackup(PASSWORD, cheap());

		await importBackup(backup, PASSWORD);
		const [importedId] = await importedProfileIds(sourceId);
		// The import does not unlock it; its password is the backup's.
		expect((await sessionStore.get())?.profileId).toBe(sourceId);
		await expect(
			send("profile.unlock", { profileId: importedId, password: null }),
		).rejects.toThrow();
		await send("profile.unlock", {
			profileId: importedId,
			password: PASSWORD,
		});

		expect(await snapshot()).toEqual(original);
		expect(original.links).toEqual([
			"note:About example -> save:https://example.com/page#part",
			"reminder:Read example -> task:Read example",
			"task:Read example -> save:https://example.com/page#part",
		]);
		expect(original.previews).toHaveLength(1);
		expect(await littleDB.jobs.count()).toBe(0);
	});

	// An export holds the profile's keys while it reads. Locking during
	// it must stop it, so no plain export or backup comes out afterwards.
	describe("when the profile locks during the export", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		const lockWhenNotesAreRead = () => {
			const bulkGet = littleDB.notes.bulkGet.bind(littleDB.notes);
			vi.spyOn(littleDB.notes, "bulkGet").mockImplementation(
				async (keys) => {
					await send("profile.lock", {});
					return bulkGet(keys);
				},
			);
		};

		it("stops the readable export", async () => {
			await seedProfile();
			lockWhenNotesAreRead();
			await expect(createReadableExport()).rejects.toThrow(
				"The profile was locked, so the export stopped.",
			);
		});

		it("stops the backup", async () => {
			await seedProfile();
			lockWhenNotesAreRead();
			await expect(createBackup(PASSWORD, cheap())).rejects.toThrow(
				"The profile was locked, so the export stopped.",
			);
		});
	});

	it("resets the AI provider and key, and keeps them out of the file", async () => {
		await seedProfile();
		const sourceId = (await unlockedKeys()).profileId;
		const backup = await createBackup(PASSWORD, cheap());
		expect(new TextDecoder().decode(await bytesOf(backup))).not.toContain(
			"attacker",
		);

		await importBackup(backup, PASSWORD);
		const [importedId] = await importedProfileIds(sourceId);
		await send("profile.unlock", {
			profileId: importedId,
			password: PASSWORD,
		});
		const settings = await readSettings(await unlockedKeys());
		expect(settings.ai.apiKey).toBe("");
		expect(settings.ai.baseUrl).not.toContain("attacker");
		expect(settings.misc).toEqual({
			VBMLimit: 1500,
			VBMSameOriginLimit: 3,
		});
	});

	it("makes two independent profiles from one backup imported twice", async () => {
		await seedProfile();
		const sourceId = (await unlockedKeys()).profileId;
		const backup = await createBackup(PASSWORD, cheap());
		await importBackup(backup, PASSWORD);
		await importBackup(backup, PASSWORD);

		const [first, second] = await importedProfileIds(sourceId);
		expect(second).toBeDefined();
		const owned = async (profileId: string) =>
			(await littleDB.saves.toArray()).filter(
				(row) => row.profileId === profileId,
			);
		const [a, b, source] = await Promise.all([
			owned(first),
			owned(second),
			owned(sourceId),
		]);
		expect(a).toHaveLength(source.length);
		const ids = new Set([...a, ...b, ...source].map((row) => row.id));
		expect(ids.size).toBe(3 * source.length);
		const urlKeys = new Set(
			[...a, ...b, ...source].map((row) => row.urlKey),
		);
		expect(urlKeys.size).toBe(3 * source.length);
	});

	it("backs up a profile without a password, under the backup's password", async () => {
		await seedProfile(null);
		const sourceId = (await unlockedKeys()).profileId;
		await importBackup(await createBackup(PASSWORD, cheap()), PASSWORD);
		const [importedId] = await importedProfileIds(sourceId);
		expect((await littleDB.profiles.get(importedId))?.protection).toBe(
			"password",
		);
	});

	it("refuses a blank backup password or one with outer spaces", async () => {
		await seedProfile();
		await expect(createBackup("", cheap())).rejects.toThrow(/password/);
		await expect(createBackup(" pad ", cheap())).rejects.toThrow(/space/);
	});

	it("rejects a wrong password without writing anything", async () => {
		await seedProfile();
		const backup = await createBackup(PASSWORD, cheap());
		const before = await rowCounts();
		await expect(importBackup(backup, "wrong")).rejects.toThrow(
			/password is wrong/,
		);
		expect(await rowCounts()).toEqual(before);
	});

	it("rolls back a damaged chunk", async () => {
		await seedProfile();
		const file = await bytesOf(await createBackup(PASSWORD, cheap()));
		file[file.length - 5] ^= 0xff;
		const before = await rowCounts();
		await expect(importBackup(new Blob([file]), PASSWORD)).rejects.toThrow(
			/damaged/,
		);
		expect(await rowCounts()).toEqual(before);
	});

	describe("with several chunks", () => {
		// A preview larger than one chunk's budget splits the backup.
		const multiChunk = async () => {
			const { saveId } = await seedProfile();
			// getRandomValues fills at most 64 KiB per call.
			const image = new Uint8Array(3 * 1024 * 1024);
			for (let i = 0; i < image.length; i += 65_536) {
				crypto.getRandomValues(image.subarray(i, i + 65_536));
			}
			await putPreview(littleDB, await unlockedKeys(), saveId, image, 1);
			const file = await bytesOf(await createBackup(PASSWORD, cheap()));
			const { header, chunks } = readBackupFile(file);
			expect(chunks.length).toBeGreaterThan(1);
			return { header, chunks };
		};

		it("rejects chunks out of order, and a file cut short", async () => {
			const { header, chunks } = await multiChunk();
			const before = await rowCounts();
			const swapped = [chunks[1], chunks[0], ...chunks.slice(2)];
			await expect(
				importBackup(
					new Blob([writeBackupFile(header, swapped)]),
					PASSWORD,
				),
			).rejects.toThrow(/damaged/);
			await expect(
				importBackup(
					new Blob([writeBackupFile(header, chunks.slice(0, -1))]),
					PASSWORD,
				),
			).rejects.toThrow(/incomplete/);
			expect(await rowCounts()).toEqual(before);
		});

		it("deletes an import cut off by a worker restart", async () => {
			const { header, chunks } = await multiChunk();
			const before = await rowCounts();
			const { jobId } = await send("backup.importBegin", {
				header: await staging.put(header.slice()),
				password: PASSWORD,
			});
			await send("backup.importChunk", {
				jobId,
				chunk: await staging.put(chunks[0].slice()),
			});
			expect((await rowCounts()).saves).toBeGreaterThan(before.saves);
			// No profile is listed while the import runs.
			expect((await rowCounts()).profiles).toBe(before.profiles);

			// What the worker does when it starts again.
			await cleanUpImports(littleDB);

			expect(await rowCounts()).toEqual(before);
			await expect(
				send("backup.importChunk", {
					jobId,
					chunk: await staging.put(chunks[1].slice()),
				}),
			).rejects.toThrow(/interrupted/);
		});
	});

	it("rejects other files and other backup formats", async () => {
		await expect(
			importBackup(new Blob(["not a backup"]), PASSWORD),
		).rejects.toThrow(/not a Little Later backup/);
		const older = writeBackupFile(new Uint8Array([1]), [
			new Uint8Array([1]),
		]);
		older[5] = BACKUP_FORMAT - 1;
		await expect(importBackup(new Blob([older]), PASSWORD)).rejects.toThrow(
			/older version/,
		);
		expect(backupFileParts(new Uint8Array([1]), [])).toHaveLength(4);
	});

	it("exports readable JSON without the AI key or images", async () => {
		await seedProfile();
		const readable = (await createReadableExport()) as Record<
			string,
			unknown
		>;
		const text = JSON.stringify(readable);
		expect(text).not.toContain("sk-secret");
		expect(text).toContain("About example");
		expect(text).toContain("https://example.com/page#part");
		expect(readable.profile).toMatchObject({ name: "Ada" });
		expect(readable).not.toHaveProperty("assets");
		expect(
			(readable.reminders as Array<{ target: string }>)[0].target,
		).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("exports only the unlocked profile", async () => {
		await seedProfile();
		await send("profile.create", { name: "Bea", password: null });
		await send("note.create", { content: "Bea's note" });
		const text = JSON.stringify(await createReadableExport());
		expect(text).toContain("Bea's note");
		expect(text).not.toContain("About example");
	});
});

// A format 3 file made by this build. Every later build must import it to
// these values (decision 0010, Rollback); do not regenerate it.
describe("the format 3 golden backup", { timeout: 30_000 }, () => {
	beforeEach(reset);

	it("imports field by field", async () => {
		const file = readFileSync(
			new URL("../fixtures/backup-format3.lldat", import.meta.url),
		);
		await importBackup(new Blob([file]), "fixture-password");
		const [profile] = await littleDB.profiles.toArray();
		await send("profile.unlock", {
			profileId: profile.id,
			password: "fixture-password",
		});
		const keys = await unlockedKeys();
		const CREATED = Date.UTC(2026, 9, 28, 12);
		const DUE = Date.UTC(2026, 10, 1, 9);
		const TARGET = Date.UTC(2026, 10, 2, 9);

		expect(profile).toMatchObject({
			name: "Fixture",
			protection: "password",
			prefs: { theme: "light", autoLockMinutes: 20 },
		});
		expect((await littleDB.avatars.get(profile.id))?.image.type).toBe(
			"image/png",
		);
		expect((await readSettings(keys)).misc).toEqual({
			VBMLimit: 1200,
			VBMSameOriginLimit: 4,
		});

		const [save] = await readSaves(keys);
		expect(save).toEqual({
			id: expect.any(String),
			url: "https://example.org/a",
			title: "Example A",
			customName: "Example A",
			saved: true,
			browsed: true,
			browsedAt: CREATED,
			createdAt: CREATED,
			updatedAt: CREATED,
		});
		const preview = await readPreview(keys, save.id);
		expect([...(await bytesOf(preview!))]).toEqual([1, 2, 3]);

		const [note] = await readNotes(keys);
		expect(note).toEqual({
			id: expect.any(String),
			content: "Fixture note",
			createdAt: CREATED,
			updatedAt: CREATED,
		});

		const [task] = await readTasks(keys);
		expect(task).toEqual({
			id: expect.any(String),
			information: "Fixture task",
			label: "Fix",
			priority: "medium",
			schedule: { kind: "due", at: DUE },
			dueAt: DUE,
			done: false,
			finishedAt: 0,
		});

		const reminders = await readReminders(keys);
		const own = reminders.find((r) => r.message === "Fixture task");
		const other = reminders.find((r) => r.message === "Fixture reminder");
		expect(own).toEqual({
			id: expect.any(String),
			message: "Fixture task",
			target: DUE,
			escalation: null,
			lastFiredAt: 0,
			nextFireAt: DUE,
		});
		expect(other).toEqual({
			id: expect.any(String),
			message: "Fixture reminder",
			target: TARGET,
			escalation: { escalate: true, stopBefore: 15 },
			lastFiredAt: 0,
			nextFireAt: Date.UTC(2026, 9, 30, 22, 30),
		});

		const pairs = (await readLinks(keys))
			.map((link) => [link.fromId, link.toId])
			.sort();
		expect(pairs).toEqual(
			[
				[note.id, save.id],
				[task.id, save.id],
				[own!.id, task.id],
			].sort(),
		);
	});
});
