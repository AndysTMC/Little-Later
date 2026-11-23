import type { RecurrenceRule } from "little-shared/utils/schedule";
import { importProfileKeys } from "../storage/keys";
import { littleDB } from "../storage/pageDB";
import {
	listNotes,
	listReminders,
	listSaves,
	listTasks,
	type Note,
	type Reminder,
	type Save,
	type Task,
} from "../storage/repositories";
import { sessionStore } from "../storage/session";
import { saveFile } from "../utils/saveFile";
import { send } from "../utils/send";
import { MAX_TAGS_PER_RECORD, normalizeTags } from "../utils/tags";

const MAX_BOOKMARK_IMPORTS = 500;
const ISO_WEEKDAY_ICS = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];

const acquireKeys = async () => {
	const session = await sessionStore.get();
	if (!session) {
		throw new Error("Unlock a profile first.");
	}
	const keys = await importProfileKeys(session);
	const profile = await littleDB.profiles.get(session.profileId);
	return { keys, profileName: profile?.name ?? "Little Later" };
};

const dateStamp = (now = Date.now()): string =>
	new Date(now).toISOString().slice(0, 10);

const safeFileSlug = (name: string): string =>
	name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "little-later";

// --- 1. Obsidian / Markdown Export ---

const yamlQuote = (value: string): string =>
	`"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;

export const buildObsidianMarkdown = ({
	saves,
	notes,
	profileName,
	exportedAt = Date.now(),
}: {
	saves: ReadonlyArray<Save>;
	notes: ReadonlyArray<Note>;
	profileName: string;
	exportedAt?: number;
}): string => {
	// Security invariant: never include locked notes in plaintext exports.
	const unlockedNotes = notes.filter((note) => !note.locked);
	const savedPages = saves.filter((save) => save.saved);

	const lines: Array<string> = [
		"---",
		"exported_from: Little Later",
		`profile: ${yamlQuote(profileName)}`,
		`exported_at: ${new Date(exportedAt).toISOString()}`,
		`notes_count: ${unlockedNotes.length}`,
		`saves_count: ${savedPages.length}`,
		"---",
		"",
		`# ${profileName} — Little Later Export`,
		"",
	];

	if (unlockedNotes.length > 0) {
		lines.push("## Notes", "");
		for (const note of unlockedNotes) {
			const heading = note.title?.trim() || "Untitled note";
			lines.push(`### ${heading}`, "");
			const meta: Array<string> = [
				`Updated: ${new Date(note.updatedAt).toISOString().slice(0, 10)}`,
			];
			if (note.tags && note.tags.length > 0) {
				meta.push(
					`Tags: ${note.tags.map((tag) => `#${tag}`).join(" ")}`,
				);
			}
			lines.push(`_${meta.join(" · ")}_`, "");
			lines.push(note.content.trim(), "", "---", "");
		}
	}

	if (savedPages.length > 0) {
		lines.push("## Saves", "");
		for (const save of savedPages) {
			const title = save.customName?.trim() || save.title || save.url;
			const safeTitle = title.replace(/[[\]]/g, "");
			const tagSuffix =
				save.tags && save.tags.length > 0
					? ` ${save.tags.map((tag) => `#${tag}`).join(" ")}`
					: "";
			const archivedBadge = save.archived ? " _(archived)_" : "";
			lines.push(
				`- [${safeTitle}](${save.url})${archivedBadge}${tagSuffix}`,
			);
			if (save.snapshot && save.snapshot.trim() !== "") {
				const excerpt = save.snapshot.trim().slice(0, 2_000);
				lines.push(
					"",
					...excerpt.split("\n").map((row) => `  > ${row}`),
					"",
				);
			}
		}
		lines.push("");
	}

	return `${lines.join("\n").trimEnd()}\n`;
};

export const exportObsidianMarkdown = async (): Promise<void> => {
	const { keys, profileName } = await acquireKeys();
	const [saves, notes] = await Promise.all([
		listSaves(littleDB, keys, true),
		listNotes(littleDB, keys),
	]);
	const md = buildObsidianMarkdown({ saves, notes, profileName });
	const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
	await saveFile(
		blob,
		`${safeFileSlug(profileName)}-notes-saves-${dateStamp()}.md`,
	);
};

// --- 2. RFC 5545 iCalendar (.ics) Export ---

const escapeIcsText = (value: string): string =>
	value
		.replace(/\\/g, "\\\\")
		.replace(/\r?\n/g, "\\n")
		.replace(/,/g, "\\,")
		.replace(/;/g, "\\;");

const formatIcsUtc = (epochMs: number): string => {
	const d = new Date(epochMs);
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
		`T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
	);
};

const foldIcsLine = (line: string): string => {
	if (line.length <= 75) return line;
	const parts: Array<string> = [];
	parts.push(line.slice(0, 75));
	for (let i = 75; i < line.length; i += 74) {
		parts.push(` ${line.slice(i, i + 74)}`);
	}
	return parts.join("\r\n");
};

const buildRrule = (rule: RecurrenceRule): string => {
	const parts: Array<string> = [`FREQ=${rule.freq.toUpperCase()}`];
	if (rule.interval > 1) {
		parts.push(`INTERVAL=${rule.interval}`);
	}
	if (rule.byWeekday && rule.byWeekday.length > 0) {
		const days = rule.byWeekday
			.map((day) => ISO_WEEKDAY_ICS[day])
			.filter(Boolean);
		if (days.length > 0) {
			parts.push(`BYDAY=${days.join(",")}`);
		}
	}
	if (rule.byMonth !== undefined) {
		parts.push(`BYMONTH=${rule.byMonth}`);
	}
	if (rule.byMonthDay !== undefined) {
		parts.push(`BYMONTHDAY=${rule.byMonthDay}`);
	}
	return parts.join(";");
};

const icsPriority = (priority: Task["priority"]): number => {
	if (priority === "high") return 1;
	if (priority === "low") return 9;
	return 5;
};

export const buildCalendarIcs = ({
	tasks,
	reminders,
	exportedAt = Date.now(),
}: {
	tasks: ReadonlyArray<Task>;
	reminders: ReadonlyArray<Reminder>;
	exportedAt?: number;
}): string => {
	const stamp = formatIcsUtc(exportedAt);
	const lines: Array<string> = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Little Later//Tasks and Reminders//EN",
		"CALSCALE:GREGORIAN",
	];

	for (const task of tasks) {
		if (task.dueAt <= 0 && task.schedule.kind === "anytime") continue;
		const summary = task.label
			? `[${task.label}] ${task.information}`
			: task.information;
		lines.push(
			"BEGIN:VTODO",
			`UID:task-${task.id}@little-later.local`,
			`DTSTAMP:${stamp}`,
			`SUMMARY:${escapeIcsText(summary)}`,
			`STATUS:${task.done ? "COMPLETED" : "NEEDS-ACTION"}`,
			`PRIORITY:${icsPriority(task.priority)}`,
		);
		if (task.dueAt > 0) {
			lines.push(`DUE:${formatIcsUtc(task.dueAt)}`);
		}
		if (task.schedule.kind === "recurring") {
			lines.push(`RRULE:${buildRrule(task.schedule.rule)}`);
		}
		if (task.tags && task.tags.length > 0) {
			lines.push(`CATEGORIES:${task.tags.map(escapeIcsText).join(",")}`);
		}
		lines.push("END:VTODO");
	}

	for (const reminder of reminders) {
		if (reminder.target <= 0) continue;
		lines.push(
			"BEGIN:VEVENT",
			`UID:reminder-${reminder.id}@little-later.local`,
			`DTSTAMP:${stamp}`,
			`DTSTART:${formatIcsUtc(reminder.target)}`,
			`DTEND:${formatIcsUtc(reminder.target + 15 * 60_000)}`,
			`SUMMARY:${escapeIcsText(reminder.message)}`,
		);
		if (reminder.tags && reminder.tags.length > 0) {
			lines.push(
				`CATEGORIES:${reminder.tags.map(escapeIcsText).join(",")}`,
			);
		}
		lines.push(
			"BEGIN:VALARM",
			"ACTION:DISPLAY",
			`DESCRIPTION:${escapeIcsText(reminder.message)}`,
			"TRIGGER:-PT0M",
			"END:VALARM",
			"END:VEVENT",
		);
	}

	lines.push("END:VCALENDAR");
	return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
};

export const exportCalendarIcs = async (): Promise<void> => {
	const { keys, profileName } = await acquireKeys();
	const [openTasks, doneTasks, reminders] = await Promise.all([
		listTasks(littleDB, keys, false),
		listTasks(littleDB, keys, true),
		listReminders(littleDB, keys),
	]);
	const ics = buildCalendarIcs({
		tasks: [...openTasks, ...doneTasks],
		reminders,
	});
	const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
	await saveFile(
		blob,
		`${safeFileSlug(profileName)}-calendar-${dateStamp()}.ics`,
	);
};

// --- 3. Netscape Bookmarks HTML Export & Import ---

const escapeHtml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

export const buildBookmarksHtml = ({
	saves,
	exportedAt = Date.now(),
}: {
	saves: ReadonlyArray<Save>;
	exportedAt?: number;
}): string => {
	const savedPages = saves.filter((save) => save.saved);
	const active = savedPages.filter((save) => !save.archived);
	const archived = savedPages.filter((save) => save.archived);
	const stampSec = Math.floor(exportedAt / 1_000);

	const renderLinks = (items: ReadonlyArray<Save>): Array<string> =>
		items.map((save) => {
			const addDate = Math.floor((save.createdAt || exportedAt) / 1_000);
			const title = escapeHtml(
				save.customName?.trim() || save.title || save.url,
			);
			const tagsAttr =
				save.tags && save.tags.length > 0
					? ` TAGS="${escapeHtml(save.tags.join(","))}"`
					: "";
			return `        <DT><A HREF="${escapeHtml(save.url)}" ADD_DATE="${addDate}"${tagsAttr}>${title}</A>`;
		});

	const lines: Array<string> = [
		"<!DOCTYPE NETSCAPE-Bookmark-file-1>",
		"<!-- Exported from Little Later -->",
		'<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
		"<TITLE>Little Later Bookmarks</TITLE>",
		"<H1>Little Later Bookmarks</H1>",
		"<DL><p>",
		`    <DT><H3 ADD_DATE="${stampSec}">Little Later Saves</H3>`,
		"    <DL><p>",
		...renderLinks(active),
		"    </DL><p>",
	];

	if (archived.length > 0) {
		lines.push(
			`    <DT><H3 ADD_DATE="${stampSec}">Archived Saves</H3>`,
			"    <DL><p>",
			...renderLinks(archived),
			"    </DL><p>",
		);
	}

	lines.push("</DL><p>");
	return `${lines.join("\n")}\n`;
};

export const exportBookmarksHtml = async (): Promise<void> => {
	const { keys, profileName } = await acquireKeys();
	const saves = await listSaves(littleDB, keys, true);
	const html = buildBookmarksHtml({ saves });
	const blob = new Blob([html], { type: "text/html;charset=utf-8" });
	await saveFile(
		blob,
		`${safeFileSlug(profileName)}-bookmarks-${dateStamp()}.html`,
	);
};

export type ParsedBookmark = {
	url: string;
	title: string;
	tags: Array<string>;
};

const isSafeWebUrl = (value: string): boolean => {
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
};

const IGNORED_FOLDERS = new Set([
	"bookmarks",
	"bookmarks bar",
	"bookmarks menu",
	"other bookmarks",
	"little later bookmarks",
	"little later saves",
]);

export const parseBookmarksHtml = (html: string): Array<ParsedBookmark> => {
	const doc = new DOMParser().parseFromString(html, "text/html");
	const results: Array<ParsedBookmark> = [];
	const seen = new Set<string>();

	const walk = (container: Element, folderTags: ReadonlyArray<string>) => {
		let pendingFolder: string | null = null;
		for (const child of Array.from(container.children)) {
			if (results.length >= MAX_BOOKMARK_IMPORTS) return;
			const tag = child.tagName.toUpperCase();
			if (tag === "H3") {
				pendingFolder = (child.textContent ?? "").trim();
				continue;
			}
			if (tag === "A") {
				const href = (child.getAttribute("href") ?? "").trim();
				if (!isSafeWebUrl(href) || seen.has(href)) continue;
				seen.add(href);
				const rawTags = (child.getAttribute("tags") ?? "")
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean);
				const combinedTags = normalizeTags([
					...folderTags,
					...rawTags,
				]).slice(0, MAX_TAGS_PER_RECORD);
				const title =
					(child.textContent ?? "").trim().slice(0, 1_000) ||
					new URL(href).hostname;
				results.push({ url: href, title, tags: combinedTags });
				continue;
			}
			if (tag === "DL") {
				const nextFolders =
					pendingFolder &&
					!IGNORED_FOLDERS.has(pendingFolder.toLowerCase())
						? [...folderTags, pendingFolder]
						: folderTags;
				pendingFolder = null;
				walk(child, nextFolders);
				continue;
			}
			// Netscape HTML often nests <H3> + <DL> or <A> inside <DT> / <P>.
			if (tag === "DT" || tag === "P" || tag === "BODY") {
				const h3 = child.querySelector(":scope > h3");
				if (h3) {
					const name = (h3.textContent ?? "").trim();
					const nestedDl = child.querySelector(":scope > dl");
					if (nestedDl) {
						const nextFolders =
							name && !IGNORED_FOLDERS.has(name.toLowerCase())
								? [...folderTags, name]
								: folderTags;
						walk(nestedDl, nextFolders);
						continue;
					}
					pendingFolder = name;
					continue;
				}
				walk(child, folderTags);
			}
		}
	};

	if (doc.body) {
		walk(doc.body, []);
	}
	return results;
};

export const importBookmarksHtml = async (
	html: string,
): Promise<{ imported: number; skipped: number }> => {
	const parsed = parseBookmarksHtml(html);
	if (parsed.length === 0) {
		throw new Error("No valid http/https bookmarks found in that file.");
	}
	let imported = 0;
	let skipped = 0;
	for (const item of parsed) {
		try {
			const captured = await send("save.capture", {
				url: item.url,
				title: item.title,
				saved: true,
			});
			if (item.tags.length > 0 && captured.id) {
				await send("save.update", {
					id: captured.id,
					tags: item.tags,
				});
			}
			imported += 1;
		} catch {
			skipped += 1;
		}
	}
	return { imported, skipped };
};
