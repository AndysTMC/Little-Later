// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commands } from "../../src/background/commands";
import {
	createCommandContext,
	createDispatcher,
	type CommandResult,
	type Dispatch,
} from "../../src/background/commands/registry";
import { importProfileKeys, sealBody } from "../../src/storage/keys";
import {
	getSave,
	listNotes,
	listNotesFor,
	listSaves,
} from "../../src/storage/repositories";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	type SessionStore,
} from "../../src/storage/session";

let db: LittleDB;
let session: SessionStore;
let clock: number;
let dispatch: Dispatch;

const value = <T>(result: CommandResult<unknown>): T => {
	if (!result.ok)
		throw new Error(`${result.error.code}: ${result.error.message}`);
	return result.value as T;
};

const run = async <T>(name: string, input: unknown): Promise<T> => {
	clock += 1_000;
	return value<T>(await dispatch(name, input));
};

const keys = async () => importProfileKeys((await session.get())!);

const capture = (url: string, title = "Page", saved?: boolean) =>
	run<{ id: string; created: boolean }>("save.capture", {
		url,
		title,
		saved,
	});

const setLimits = async (VBMLimit: number, VBMSameOriginLimit: number) => {
	const k = await keys();
	const { LINITIAL_USER_SETTINGS } = await import("little-shared/constants");
	const settings = LINITIAL_USER_SETTINGS.value;
	settings.misc = { VBMLimit, VBMSameOriginLimit };
	await db.settings.put({
		id: k.profileId,
		profileId: k.profileId,
		createdAt: 0,
		updatedAt: 0,
		...(await sealBody(k, "settings", k.profileId, settings)),
	});
};

beforeEach(async () => {
	db = openLittleDB(`little-test-${crypto.randomUUID()}`);
	await db.open();
	session = createMemorySessionStore();
	clock = Date.UTC(2026, 9, 28);
	dispatch = createDispatcher(
		commands,
		createCommandContext(db, session, () => clock),
	);
	await run("profile.create", { name: "Ada", password: null });
});

afterEach(async () => {
	await db.delete();
});

describe("save.capture", () => {
	it("is refused while locked and writes nothing", async () => {
		await run("profile.lock", null);
		expect(
			await dispatch("save.capture", {
				url: "https://a.test/",
				title: "A",
			}),
		).toMatchObject({ ok: false, error: { code: "locked" } });
		expect(await db.saves.count()).toBe(0);
	});

	it("keeps one record per URL and stores no URL or title in clear", async () => {
		const first = await capture("https://a.test/page#top", "Old");
		const again = await capture("HTTPS://A.TEST/page", "New");
		expect(first.created).toBe(true);
		expect(again).toEqual({ id: first.id, created: false });
		expect(await db.saves.count()).toBe(1);

		const save = await getSave(db, await keys(), first.id);
		expect(save).toMatchObject({
			url: "https://a.test/page#top",
			title: "New",
			customName: "Old",
			browsed: true,
			saved: false,
		});
		const raw = JSON.stringify(await db.saves.get(first.id), (_, v) =>
			v instanceof Uint8Array ? new TextDecoder().decode(v) : v,
		);
		expect(raw).not.toContain("a.test");
		expect(raw).not.toContain("New");
	});

	it("serializes concurrent captures of one URL into one record", async () => {
		const results = await Promise.all([
			dispatch("save.capture", { url: "https://a.test/", title: "A" }),
			dispatch("save.capture", { url: "https://a.test/", title: "A" }),
			dispatch("save.capture", {
				url: "https://a.test/",
				title: "A",
				saved: true,
			}),
		]);
		expect(results.every((r) => r.ok)).toBe(true);
		expect(await db.saves.count()).toBe(1);
		expect((await listSaves(db, await keys(), true)).length).toBe(1);
	});

	it("refuses non-web URLs", async () => {
		for (const url of [
			"file:///etc/passwd",
			"javascript:alert(1)",
			"nope",
		]) {
			expect(
				await dispatch("save.capture", { url, title: "x" }),
			).toMatchObject({ ok: false, error: { code: "invalid-input" } });
		}
	});

	it("falls back to the host name for an empty title", async () => {
		const { id } = await capture("https://a.test/x", "   ");
		expect((await getSave(db, await keys(), id))?.title).toBe("a.test");
	});

	it("evicts the oldest unsaved pages of a site past the per-site limit", async () => {
		await setLimits(1000, 2);
		const a = await capture("https://a.test/1");
		const b = await capture("https://a.test/2");
		const kept = await capture("https://a.test/kept", "K", true);
		const other = await capture("https://b.test/1");
		await run("note.create", { content: "on a", saveId: a.id });
		const c = await capture("https://a.test/3");

		const ids = (await db.saves.toArray()).map((row) => row.id).sort();
		expect(ids).toEqual([b.id, kept.id, other.id, c.id].sort());
		// The evicted page's links went with it.
		expect(await db.links.count()).toBe(0);
	});

	it("evicts the oldest unsaved pages past the history limit", async () => {
		await setLimits(2, 10);
		const a = await capture("https://a.test/");
		await capture("https://b.test/");
		await capture("https://c.test/");
		expect(await db.saves.get(a.id)).toBeUndefined();
		expect(await db.saves.count()).toBe(2);
	});
});

describe("save.update and save.delete", () => {
	it("renames and saves a page", async () => {
		const { id } = await capture("https://a.test/");
		await run("save.update", { id, saved: true, customName: " Mine " });
		const [save] = await listSaves(db, await keys(), true);
		expect(save).toMatchObject({ id, saved: true, customName: "Mine" });
	});

	it("unsaving detaches notes but keeps them", async () => {
		const { id } = await capture("https://a.test/", "A", true);
		await run("note.create", { content: "n", saveId: id });
		await run("save.update", { id, saved: false });
		expect(await listNotesFor(db, await keys(), id)).toEqual([]);
		expect(await listNotes(db, await keys())).toHaveLength(1);
	});

	it("deletes a page that is neither saved nor in history", async () => {
		const { id } = await capture("https://a.test/");
		expect(await run("save.update", { id, browsed: false })).toEqual({
			deleted: true,
		});
		expect(await db.saves.count()).toBe(0);
	});

	it("deletes a page with its notes and links, and again is a no-op", async () => {
		const { id } = await capture("https://a.test/", "A", true);
		await run("note.create", { content: "attached", saveId: id });
		await run("note.create", { content: "standalone" });
		await run("save.delete", { id });
		await run("save.delete", { id });
		expect(await db.saves.count()).toBe(0);
		expect(await db.links.count()).toBe(0);
		const notes = await listNotes(db, await keys());
		expect(notes.map((n) => n.content)).toEqual(["standalone"]);
	});

	it("does not touch another profile's records", async () => {
		const { id } = await capture("https://a.test/", "A", true);
		await run("profile.create", { name: "Bo", password: null });
		expect(
			await dispatch("save.update", { id, saved: false }),
		).toMatchObject({
			ok: false,
			error: { code: "rejected" },
		});
		await run("save.delete", { id });
		expect(await db.saves.count()).toBe(1);
	});
});

describe("notes", () => {
	it("creates, edits and deletes a note", async () => {
		const { id } = await run<{ id: string }>("note.create", {
			content: "a",
		});
		await run("note.update", { id, content: "b" });
		expect((await listNotes(db, await keys()))[0].content).toBe("b");
		await run("note.delete", { id });
		await run("note.delete", { id });
		expect(await db.notes.count()).toBe(0);
	});

	it("refuses empty notes and unknown saves", async () => {
		expect(await dispatch("note.create", { content: "  " })).toMatchObject({
			ok: false,
			error: { code: "invalid-input" },
		});
		expect(
			await dispatch("note.create", { content: "x", saveId: "missing" }),
		).toMatchObject({ ok: false, error: { code: "rejected" } });
		expect(await db.notes.count()).toBe(0);
	});
});
