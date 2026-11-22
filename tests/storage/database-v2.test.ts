// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importProfileKeys, openAsset } from "../../src/storage/keys";
import { unlockProfile } from "../../src/storage/profiles";
import {
	PREVIEW_KIND,
	listChatMessages,
	listChats,
	listNotes,
	listReminders,
	listSaves,
	listTasks,
} from "../../src/storage/repositories";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	fromBase64,
	type SessionStore,
} from "../../src/storage/session";

// A database as schema version 2 wrote it (decision 0010, Verification;
// decision 0017, Storage): every later build must open it, unlock it with
// its password and read every table back, including encrypted chats and
// chatMessages.

type Fixture = {
	version: number;
	password: string;
	stores: Record<string, string>;
	tables: Record<string, Array<Record<string, unknown>>>;
};

const fixture = JSON.parse(
	readFileSync(
		new URL("../fixtures/database-v2.json", import.meta.url),
		"utf8",
	),
) as Fixture;

const decode = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(decode);
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (typeof record.$bytes === "string") return fromBase64(record.$bytes);
		return Object.fromEntries(
			Object.entries(record).map(([key, inner]) => [key, decode(inner)]),
		);
	}
	return value;
};

const CREATED = Date.parse("2026-11-20T12:00:00Z");

let name: string;
let db: LittleDB;
let session: SessionStore;

beforeEach(async () => {
	name = `little-fixture-v2-${crypto.randomUUID()}`;
	const v2 = new Dexie(name);
	v2.version(fixture.version).stores(fixture.stores);
	await v2.open();
	for (const [table, rows] of Object.entries(fixture.tables)) {
		await v2.table(table).bulkAdd(rows.map(decode));
	}
	v2.close();

	db = openLittleDB(name);
	await db.open();
	session = createMemorySessionStore();
});

afterEach(async () => {
	await db.delete();
});

describe("a schema v2 database", () => {
	it("opens with its password and reads records, previews, and encrypted chats", async () => {
		const [profile] = await db.profiles.toArray();
		expect(profile).toMatchObject({
			name: "Fixture V2",
			protection: "password",
			createdAt: CREATED,
			prefs: { theme: "dark", autoLockMinutes: 20, accent: "teal" },
		});
		await unlockProfile(db, session, profile.id, fixture.password);
		const keys = await importProfileKeys((await session.get())!);

		const [save] = await listSaves(db, keys, true);
		expect(save).toMatchObject({
			url: "https://example.org/v2",
			title: "Example V2",
			saved: true,
		});
		const preview = await db.assets
			.where("[profileId+ownerId]")
			.equals([profile.id, save.id])
			.filter((asset) => asset.kind === PREVIEW_KIND)
			.first();
		expect(preview).toBeDefined();
		expect([
			...(await openAsset(keys, preview!.id, preview!.body)),
		]).toEqual([0xff, 0xd8, 0xff, 0xe0]);

		const [note] = await listNotes(db, keys);
		expect(note.content).toBe("Note in DB v2");

		const [task] = await listTasks(db, keys, false);
		expect(task).toMatchObject({
			information: "Task in DB v2",
			label: "v2",
			priority: "high",
		});

		const [reminder] = await listReminders(db, keys);
		expect(reminder.message).toBe("Reminder in DB v2");

		const chats = await listChats(db, keys);
		expect(chats).toHaveLength(1);
		expect(chats[0].title).toBe("Fixture chat");

		const messages = await listChatMessages(db, keys, chats[0].id);
		expect(messages).toHaveLength(2);
		expect(messages[0]).toMatchObject({
			role: "user",
			text: "Summarize my saves",
		});
		expect(messages[1]).toMatchObject({
			role: "assistant",
			output: {
				message: "You have 1 save.",
				expression: "happy",
				steps: ["Searched saves"],
			},
		});
	});
});
