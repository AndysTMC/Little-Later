// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "../../src/background/commands";
import { isTrustedSender } from "../../src/background/commands/listener";
import {
	CommandError,
	createCommandContext,
	createDispatcher,
	defineCommand,
	type Dispatch,
} from "../../src/background/commands/registry";
import { ProfileError } from "../../src/storage/profiles";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	type SessionStore,
} from "../../src/storage/session";

let db: LittleDB;
let session: SessionStore;
let dispatch: Dispatch;

beforeEach(async () => {
	db = openLittleDB(`little-test-${crypto.randomUUID()}`);
	await db.open();
	session = createMemorySessionStore();
	dispatch = createDispatcher(commands, createCommandContext(db, session));
});

afterEach(async () => {
	await db.delete();
});

describe("dispatcher", () => {
	it("runs commands one at a time, in order", async () => {
		const log: Array<string> = [];
		const slow = defineCommand({
			name: "test.slow",
			parse: (input) => String(input),
			run: async (_, input) => {
				log.push(`start ${input}`);
				await new Promise((resolve) => setTimeout(resolve, 20));
				log.push(`end ${input}`);
				return input;
			},
		});
		const run = createDispatcher([slow], createCommandContext(db, session));
		const results = await Promise.all([
			run("test.slow", "a"),
			run("test.slow", "b"),
		]);
		expect(log).toEqual(["start a", "end a", "start b", "end b"]);
		expect(results).toEqual([
			{ ok: true, value: "a" },
			{ ok: true, value: "b" },
		]);
	});

	it("keeps going after a command fails", async () => {
		const boom = defineCommand({
			name: "test.boom",
			parse: () => null,
			run: async () => {
				throw new Error("secret detail");
			},
		});
		const run = createDispatcher([boom], createCommandContext(db, session));
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(await run("test.boom", null)).toEqual({
			ok: false,
			error: { code: "internal", message: "Something went wrong." },
		});
		expect(await run("test.missing", null)).toMatchObject({
			ok: false,
			error: { code: "unknown-command" },
		});
	});

	it("maps refusals and locked state to their codes", async () => {
		const refuse = defineCommand({
			name: "test.refuse",
			parse: () => null,
			run: async () => {
				throw new ProfileError("No.");
			},
		});
		const needsKeys = defineCommand({
			name: "test.keys",
			parse: () => null,
			run: async (ctx) => (await ctx.keys()).profileId,
		});
		const run = createDispatcher(
			[refuse, needsKeys],
			createCommandContext(db, session),
		);
		expect(await run("test.refuse", null)).toEqual({
			ok: false,
			error: { code: "rejected", message: "No." },
		});
		expect(await run("test.keys", null)).toMatchObject({
			ok: false,
			error: { code: "locked" },
		});
	});
});

describe("profile commands", () => {
	it("rejects malformed input before running", async () => {
		for (const input of [
			null,
			[],
			{ name: 3, password: null },
			{ name: "  ", password: null },
			{ name: "A", password: 5 },
		]) {
			expect(await dispatch("profile.create", input)).toMatchObject({
				ok: false,
				error: { code: "invalid-input" },
			});
		}
		expect(await db.profiles.count()).toBe(0);
	});

	it("creates, locks, unlocks and deletes a profile", async () => {
		const created = await dispatch("profile.create", {
			name: " Ada ",
			password: null,
		});
		expect(created.ok).toBe(true);
		const { profileId } = (created as { value: { profileId: string } })
			.value;
		expect((await db.profiles.get(profileId))?.name).toBe("Ada");

		expect(await dispatch("profile.lock", null)).toEqual({
			ok: true,
			value: null,
		});
		expect(await session.get()).toBeNull();

		expect(
			await dispatch("profile.unlock", { profileId, password: null }),
		).toEqual({ ok: true, value: null });
		expect((await session.get())?.profileId).toBe(profileId);

		expect(
			await dispatch("profile.delete", { profileId, password: null }),
		).toEqual({ ok: true, value: null });
		expect(await db.profiles.count()).toBe(0);
	});

	it("reports a wrong password as a refusal", async () => {
		const created = await dispatch("profile.create", {
			name: "Ada",
			password: "pw",
		});
		const { profileId } = (created as { value: { profileId: string } })
			.value;
		await dispatch("profile.lock", null);
		expect(
			await dispatch("profile.unlock", { profileId, password: "nope" }),
		).toMatchObject({ ok: false, error: { code: "rejected" } });
		expect(
			await dispatch("profile.delete", { profileId, password: "nope" }),
		).toMatchObject({ ok: false, error: { code: "rejected" } });
		expect(await db.profiles.count()).toBe(1);
	});
});

describe("sender check", () => {
	const id = "abcdefghijklmnopabcdefghijklmnop";
	const origin = `chrome-extension://${id}/`;

	it.each([
		["the extension's popup", { id, url: `${origin}popup.html` }, true],
		[
			"another extension",
			{ id: "other", url: `chrome-extension://other/x.html` },
			false,
		],
		["a content script", { id, url: "https://example.com/" }, false],
		["a sender without a URL", { id }, false],
		[
			"a look-alike origin",
			{ id, url: `chrome-extension://${id}.evil/x` },
			false,
		],
	])("%s → %s", (_, sender, trusted) => {
		expect(isTrustedSender(sender, id, origin)).toBe(trusted);
	});

	it("CommandError carries its code", () => {
		expect(new CommandError("locked", "x").code).toBe("locked");
	});
});
