// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAutoLock } from "../../src/background/autoLock";
import { commands } from "../../src/background/commands";
import {
	createCommandContext,
	createDispatcher,
	createSerialQueue,
	type Dispatch,
} from "../../src/background/commands/registry";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	type SessionStore,
} from "../../src/storage/session";

type State = "active" | "idle" | "locked";

let db: LittleDB;
let session: SessionStore;
let dispatch: Dispatch;
let intervals: Array<number>;
let fireState: (state: State) => void;
let autoLock: ReturnType<typeof createAutoLock>;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
	db = openLittleDB(`little-test-${crypto.randomUUID()}`);
	await db.open();
	session = createMemorySessionStore();
	const queue = createSerialQueue();
	dispatch = createDispatcher(
		commands,
		createCommandContext(db, session),
		queue,
	);
	intervals = [];
	autoLock = createAutoLock({
		db,
		session,
		queue,
		idle: {
			setDetectionInterval: (seconds) => intervals.push(seconds),
			onStateChanged: {
				addListener: (listener) => {
					fireState = listener;
				},
			},
		},
	});
	autoLock.start();
	await dispatch("profile.create", { name: "Ada", password: null });
	await settle();
});

afterEach(async () => {
	await db.delete();
});

describe("auto-lock", () => {
	it("uses the profile's idle minutes, and follows changes", async () => {
		expect(intervals.at(-1)).toBe(30 * 60);
		await dispatch("profile.update", { autoLockMinutes: 5 });
		await autoLock.configure();
		expect(intervals.at(-1)).toBe(5 * 60);
	});

	it("locks when the device goes idle or the screen locks", async () => {
		fireState("active");
		await settle();
		expect(await session.get()).not.toBeNull();
		fireState("idle");
		await settle();
		expect(await session.get()).toBeNull();

		const profileId = (await db.profiles.toArray())[0].id;
		await dispatch("profile.unlock", { profileId, password: null });
		fireState("locked");
		await settle();
		expect(await session.get()).toBeNull();
	});
});
