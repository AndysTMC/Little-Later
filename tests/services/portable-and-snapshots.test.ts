import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { LTASK_PRIORITY } from "little-shared/enums";
import {
	buildBookmarksHtml,
	buildCalendarIcs,
	buildObsidianMarkdown,
	parseBookmarksHtml,
} from "../../src/services/portable";
import { searchSaves } from "../../src/popup/records";
import {
	createCommandContext,
	createDispatcher,
	createSerialQueue,
} from "../../src/background/commands/registry";
import { commands } from "../../src/background/commands";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import { createMemorySessionStore } from "../../src/storage/session";
import { importProfileKeys } from "../../src/storage/keys";
import {
	getSave,
	type Note,
	type Reminder,
	type Save,
	type Task,
} from "../../src/storage/repositories";

describe("portable exports, bookmarks import, and offline reader snapshots", () => {
	const dbs: Array<LittleDB> = [];

	afterEach(async () => {
		for (const db of dbs.splice(0)) {
			db.close();
			await db.delete();
		}
	});

	it("exports Obsidian Markdown while strictly excluding locked notes", () => {
		const notes: Array<Note> = [
			{
				id: "n1",
				title: "Architecture",
				content: "Local-first encrypted vault.",
				tags: ["design"],
				createdAt: Date.UTC(2026, 10, 20),
				updatedAt: Date.UTC(2026, 10, 22),
			},
			{
				id: "n2",
				title: "Secrets",
				content: "TOP_SECRET_LOCKED_CONTENT",
				locked: true,
				createdAt: Date.UTC(2026, 10, 20),
				updatedAt: Date.UTC(2026, 10, 22),
			},
		];
		const saves: Array<Save> = [
			{
				id: "s1",
				url: "https://example.com/article",
				title: "Offline Article",
				customName: "Offline Article",
				tags: ["reading"],
				snapshot: "Key takeaway from the offline article.",
				saved: true,
				browsed: true,
				browsedAt: Date.UTC(2026, 10, 22),
				createdAt: Date.UTC(2026, 10, 22),
				updatedAt: Date.UTC(2026, 10, 22),
			},
		];

		const md = buildObsidianMarkdown({
			saves,
			notes,
			profileName: "Work",
			exportedAt: Date.UTC(2026, 10, 23),
		});

		expect(md).toContain("exported_from: Little Later");
		expect(md).toContain("notes_count: 1");
		expect(md).toContain("### Architecture");
		expect(md).toContain("Local-first encrypted vault.");
		expect(md).toContain("[Offline Article](https://example.com/article)");
		expect(md).toContain("> Key takeaway from the offline article.");
		expect(md).not.toContain("TOP_SECRET_LOCKED_CONTENT");
		expect(md).not.toContain("Secrets");
	});

	it("exports RFC 5545 iCalendar (.ics) with RRULE for recurring tasks and VALARM for reminders", () => {
		const tasks: Array<Task> = [
			{
				id: "t1",
				information: "Weekly review, team sync",
				label: "Ops",
				priority: LTASK_PRIORITY.HIGH,
				tags: ["work"],
				schedule: {
					kind: "recurring",
					rule: {
						freq: "weekly",
						interval: 1,
						time: "09:00",
						byWeekday: [1, 3],
						anchor: "2026-11-23",
						zone: "floating",
					},
				},
				dueAt: Date.UTC(2026, 10, 23, 9, 0, 0),
				finishedAt: 0,
				done: false,
			},
		];
		const reminders: Array<Reminder> = [
			{
				id: "r1",
				message: "Deploy v3.1; verify checksums",
				tags: ["release"],
				target: Date.UTC(2026, 10, 24, 14, 30, 0),
				escalation: null,
				lastFiredAt: 0,
				nextFireAt: Date.UTC(2026, 10, 24, 14, 30, 0),
			},
		];

		const ics = buildCalendarIcs({
			tasks,
			reminders,
			exportedAt: Date.UTC(2026, 10, 23, 8, 0, 0),
		});

		expect(ics).toContain("BEGIN:VCALENDAR\r\n");
		expect(ics).toContain("BEGIN:VTODO\r\n");
		expect(ics).toContain("SUMMARY:[Ops] Weekly review\\, team sync\r\n");
		expect(ics).toContain("PRIORITY:1\r\n");
		expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\n");
		expect(ics).toContain("BEGIN:VEVENT\r\n");
		expect(ics).toContain("SUMMARY:Deploy v3.1\\; verify checksums\r\n");
		expect(ics).toContain("BEGIN:VALARM\r\n");
		expect(ics).toContain("END:VCALENDAR\r\n");
	});

	it("round-trips Netscape Bookmarks HTML and rejects unsafe URLs", () => {
		const saves: Array<Save> = [
			{
				id: "s1",
				url: "https://example.org/docs",
				title: "Example Docs",
				customName: "Example Docs",
				tags: ["reference", "dev"],
				saved: true,
				browsed: true,
				browsedAt: Date.UTC(2026, 10, 22),
				createdAt: Date.UTC(2026, 10, 22),
				updatedAt: Date.UTC(2026, 10, 22),
			},
		];
		const html = buildBookmarksHtml({
			saves,
			exportedAt: Date.UTC(2026, 10, 23),
		});
		expect(html).toContain("<!DOCTYPE NETSCAPE-Bookmark-file-1>");
		expect(html).toContain('TAGS="reference,dev"');

		const rawWithUnsafe = `
			<!DOCTYPE NETSCAPE-Bookmark-file-1>
			<DL><p>
				<DT><H3>Engineering</H3>
				<DL><p>
					<DT><A HREF="https://example.org/docs" TAGS="dev">Example Docs</A>
					<DT><A HREF="https://example.org/docs">Duplicate URL</A>
					<DT><A HREF="javascript:alert(1)">XSS</A>
					<DT><A HREF="file:///etc/passwd">Local</A>
				</DL><p>
			</DL><p>
		`;
		const parsed = parseBookmarksHtml(rawWithUnsafe);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]).toEqual({
			url: "https://example.org/docs",
			title: "Example Docs",
			tags: ["engineering", "dev"],
		});
	});

	it("stores encrypted offline article snapshots on saves and searches them", async () => {
		const db = openLittleDB(`little-snapshot-${crypto.randomUUID()}`);
		dbs.push(db);
		const session = createMemorySessionStore();
		const dispatch = createDispatcher(
			commands,
			createCommandContext(db, session),
			createSerialQueue(),
		);
		const created = await dispatch("profile.create", {
			name: "Reader",
			password: null,
		});
		expect(created.ok).toBe(true);

		const captured = await dispatch("save.capture", {
			url: "https://example.com/deep-dive",
			title: "Deep Dive",
			saved: true,
			snapshot: "Temporal anchored recurrence prevents DST drift.",
		});
		expect(captured.ok).toBe(true);
		const saveId = (captured as { ok: true; value: { id: string } }).value
			.id;

		// Updating customName preserves the offline snapshot.
		const updated = await dispatch("save.update", {
			id: saveId,
			customName: "Recurrence Notes",
		});
		expect(updated.ok).toBe(true);

		const unlocked = await session.get();
		const keys = await importProfileKeys(unlocked!);
		const save = await getSave(db, keys, saveId);
		expect(save?.snapshot).toBe(
			"Temporal anchored recurrence prevents DST drift.",
		);
		expect(searchSaves([save!], "DST drift")).toHaveLength(1);
		expect(searchSaves([save!], "nonexistent")).toHaveLength(0);
	});
});
