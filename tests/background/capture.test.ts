// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	CAPTURE_THROTTLE_MS,
	createPageCapture,
	type PageCapture,
} from "../../src/background/capture";
import { commands } from "../../src/background/commands";
import {
	createCommandContext,
	createDispatcher,
	createSerialQueue,
	type Dispatch,
} from "../../src/background/commands/registry";
import { importProfileKeys, openAsset } from "../../src/storage/keys";
import { PREVIEW_KIND, listSaves } from "../../src/storage/repositories";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	type SessionStore,
} from "../../src/storage/session";

const START = Date.UTC(2026, 2, 7, 12);
const tab = { url: "https://a.test/page", title: "A page", windowId: 1 };

let db: LittleDB;
let session: SessionStore;
let clock: number;
let dispatch: Dispatch;
let capture: PageCapture;
let shot: Uint8Array | undefined;
let shots: number;

const keys = async () => importProfileKeys((await session.get())!);

const previews = async () => {
	const profileKeys = await keys();
	const rows = await db.assets
		.filter((asset) => asset.kind === PREVIEW_KIND)
		.toArray();
	return Promise.all(
		rows.map(async (row) => ({
			ownerId: row.ownerId,
			bytes: [...(await openAsset(profileKeys, row.id, row.body))],
		})),
	);
};

beforeEach(async () => {
	db = openLittleDB(`little-test-${crypto.randomUUID()}`);
	await db.open();
	session = createMemorySessionStore();
	clock = START;
	shot = new Uint8Array([0xff, 0xd8, 0xff, 1]);
	shots = 0;
	const queue = createSerialQueue();
	dispatch = createDispatcher(
		commands,
		createCommandContext(db, session, () => clock),
		queue,
	);
	capture = createPageCapture({
		db,
		session,
		queue,
		dispatch,
		now: () => clock,
		screenshot: async () => {
			shots += 1;
			return shot;
		},
	});
	await dispatch("profile.create", { name: "Ada", password: null });
});

afterEach(async () => {
	await db.delete();
});

describe("page capture", () => {
	it("records a visit with a sealed preview", async () => {
		await capture.visit(tab);
		const [save] = await listSaves(db, await keys(), false);
		expect(save).toMatchObject({
			url: tab.url,
			title: tab.title,
			saved: false,
			browsed: true,
		});
		expect(await previews()).toEqual([
			{ ownerId: save.id, bytes: [0xff, 0xd8, 0xff, 1] },
		]);
	});

	it("does nothing while locked, not even a screenshot", async () => {
		await dispatch("profile.lock", {});
		await capture.visit(tab);
		expect(shots).toBe(0);
		expect(await db.saves.count()).toBe(0);
	});

	it("skips pages that are not on the web", async () => {
		await capture.visit({ ...tab, url: "chrome://settings" });
		await capture.visit({ ...tab, url: undefined });
		expect(shots).toBe(0);
		expect(await db.saves.count()).toBe(0);
	});

	it("throttles repeat visits and then replaces the preview", async () => {
		await capture.visit(tab);
		shot = new Uint8Array([0xff, 0xd8, 0xff, 2]);
		clock += CAPTURE_THROTTLE_MS - 1;
		await capture.visit(tab);
		expect(shots).toBe(1);
		clock += 1;
		await capture.visit(tab);
		expect(shots).toBe(2);
		expect(await previews()).toMatchObject([
			{ bytes: [0xff, 0xd8, 0xff, 2] },
		]);
	});

	it("records the visit when the screenshot fails", async () => {
		shot = undefined;
		await capture.visit(tab);
		expect(await db.saves.count()).toBe(1);
		expect(await previews()).toEqual([]);
	});

	it("saves a page", async () => {
		expect(await capture.save(tab)).toBe("saved");
		const [save] = await listSaves(db, await keys(), true);
		expect(save.saved).toBe(true);
		expect(await previews()).toHaveLength(1);
	});

	it("tells why a page was not saved", async () => {
		expect(await capture.save({ ...tab, url: "about:blank" })).toBe(
			"unsupported",
		);
		await dispatch("profile.lock", {});
		expect(await capture.save(tab)).toBe("locked");
	});
});
