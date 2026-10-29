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
	getSettings,
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

// A database as format v1 wrote it (decision 0010, Verification): every
// later build must open it, unlock it with its password and read each
// record back. The rows were made once through the worker's commands at
// 2026-10-28T12:00Z with password "fixture-password"; never regenerate
// them to make this test pass.

type Fixture = {
	version: number;
	password: string;
	stores: Record<string, string>;
	tables: Record<string, Array<Record<string, unknown>>>;
};

const fixture = JSON.parse(
	readFileSync(
		new URL("../fixtures/database-v1.json", import.meta.url),
		"utf8",
	),
) as Fixture;

// Bytes and blobs are tagged in the JSON file.
const decode = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(decode);
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (typeof record.$bytes === "string") return fromBase64(record.$bytes);
		if (record.$blob) {
			const blob = record.$blob as { type: string; bytes: string };
			return new Blob([fromBase64(blob.bytes).slice()], {
				type: blob.type,
			});
		}
		return Object.fromEntries(
			Object.entries(record).map(([key, inner]) => [key, decode(inner)]),
		);
	}
	return value;
};

const at = (iso: string) => Date.parse(iso);
const CREATED = at("2026-10-28T12:00:00Z");

let name: string;
let db: LittleDB;
let session: SessionStore;

beforeEach(async () => {
	name = `little-fixture-${crypto.randomUUID()}`;
	// Written with the stores format v1 declared, not with today's code.
	const v1 = new Dexie(name);
	v1.version(fixture.version).stores(fixture.stores);
	await v1.open();
	for (const [table, rows] of Object.entries(fixture.tables)) {
		await v1.table(table).bulkAdd(rows.map(decode));
	}
	v1.close();

	db = openLittleDB(name);
	await db.open();
	session = createMemorySessionStore();
});

afterEach(async () => {
	await db.delete();
});

describe("a format v1 database", () => {
	it("opens with its password and reads every record field by field", async () => {
		const [profile] = await db.profiles.toArray();
		expect(profile).toMatchObject({
			name: "Fixture",
			protection: "password",
			createdAt: CREATED,
			prefs: { theme: "dark", autoLockMinutes: 20 },
		});
		await unlockProfile(db, session, profile.id, fixture.password);
		const keys = await importProfileKeys((await session.get())!);

		const avatar = await db.avatars.get(profile.id);
		expect(avatar?.image.type).toBe("image/png");
		expect([...new Uint8Array(await avatar!.image.arrayBuffer())]).toEqual([
			0x89, 0x50, 0x4e, 0x47,
		]);
		expect((await getSettings(db, keys)).misc).toEqual({
			VBMLimit: 1200,
			VBMSameOriginLimit: 4,
		});

		const [save] = await listSaves(db, keys, true);
		expect(save).toMatchObject({
			url: "https://example.org/a",
			title: "Example A",
			customName: "Example A (mine)",
			saved: true,
			browsed: true,
			createdAt: CREATED,
		});
		const preview = await db.assets
			.where("[profileId+ownerId]")
			.equals([profile.id, save.id])
			.filter((asset) => asset.kind === PREVIEW_KIND)
			.first();
		expect([
			...(await openAsset(keys, preview!.id, preview!.body)),
		]).toEqual([1, 2, 3]);

		const [note] = await listNotes(db, keys);
		expect(note).toMatchObject({ content: "Fixture note" });

		const tasks = await listTasks(db, keys);
		const byText = (text: string) =>
			tasks.find((task) => task.information === text);
		expect(byText("Fixture task")).toMatchObject({
			label: "Fix",
			priority: "high",
			schedule: { kind: "due", at: at("2026-11-01T09:00:00Z") },
			dueAt: at("2026-11-01T09:00:00Z"),
		});
		expect(byText("Weekly review")).toMatchObject({
			schedule: {
				kind: "recurring",
				rule: {
					freq: "weekly",
					interval: 1,
					time: "09:00",
					byWeekday: [5],
					anchor: "2026-10-30",
					zone: "floating",
				},
			},
			dueAt: at("2026-10-30T09:00:00Z"),
		});
		const weekly = await db.tasks.get(byText("Weekly review")!.id);
		expect(weekly?.occursOn).toBe("2026-10-30");

		const reminders = await listReminders(db, keys);
		const fires = Object.fromEntries(
			reminders.map((reminder) => [
				reminder.message,
				[reminder.target, reminder.nextFireAt, reminder.escalation],
			]),
		);
		const escalating = { escalate: true, stopBefore: 15 };
		expect(fires).toEqual({
			"Fixture task": [
				at("2026-11-01T09:00:00Z"),
				at("2026-11-01T09:00:00Z"),
				null,
			],
			"Weekly review": [
				at("2026-10-30T09:00:00Z"),
				at("2026-10-29T10:30:00Z"),
				escalating,
			],
			"Fixture reminder": [
				at("2026-11-02T09:00:00Z"),
				at("2026-10-30T22:30:00Z"),
				escalating,
			],
		});

		const label = new Map<string, string>([
			[save.id, "save"],
			[note.id, "note"],
			...tasks.map(
				(task) => [task.id, `task:${task.information}`] as const,
			),
			...reminders.map(
				(reminder) =>
					[reminder.id, `reminder:${reminder.message}`] as const,
			),
		]);
		const links = (await db.links.toArray())
			.map(
				(link) =>
					`${label.get(link.fromId)} -> ${label.get(link.toId)}`,
			)
			.sort();
		expect(links).toEqual([
			"note -> save",
			"reminder:Fixture reminder -> save",
			"reminder:Fixture task -> task:Fixture task",
			"reminder:Weekly review -> task:Weekly review",
			"task:Fixture task -> save",
		]);
	});

	it("does not open with another password", async () => {
		const [profile] = await db.profiles.toArray();
		await expect(
			unlockProfile(db, session, profile.id, "wrong-password"),
		).rejects.toThrow();
		expect(await session.get()).toBeNull();
	});
});
