// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LAI_PROVIDERS } from "little-shared/enums";
import { commands } from "../../src/background/commands";
import {
	createCommandContext,
	createDispatcher,
	type CommandResult,
	type Dispatch,
} from "../../src/background/commands/registry";
import { importProfileKeys } from "../../src/storage/keys";
import {
	defaultSettings,
	getSettings,
	listNotesFor,
} from "../../src/storage/repositories";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	type SessionStore,
} from "../../src/storage/session";
import {
	STAGED_FILE_MAX_AGE,
	createMemoryStaging,
	type Staging,
} from "../../src/storage/staging";

let db: LittleDB;
let session: SessionStore;
let staging: Staging;
let dispatch: Dispatch;
let profileId: string;

const run = async <T>(name: string, input: unknown): Promise<T> => {
	const result: CommandResult<unknown> = await dispatch(name, input);
	if (!result.ok)
		throw new Error(`${result.error.code}: ${result.error.message}`);
	return result.value as T;
};
const refused = async (name: string, input: unknown) => {
	const result = await dispatch(name, input);
	return result.ok ? null : result.error.code;
};
const keys = async () => importProfileKeys((await session.get())!);

beforeEach(async () => {
	db = openLittleDB(`little-test-${crypto.randomUUID()}`);
	await db.open();
	session = createMemorySessionStore();
	staging = createMemoryStaging();
	dispatch = createDispatcher(
		commands,
		createCommandContext(
			db,
			session,
			() => 1_000,
			() => "UTC",
			staging,
		),
	);
	({ profileId } = await run<{ profileId: string }>("profile.create", {
		name: "Ada",
		password: null,
	}));
});

afterEach(async () => {
	await db.delete();
});

describe("profile.update", () => {
	it("renames and changes plain preferences", async () => {
		await run("profile.update", {
			name: " Ada L ",
			theme: "dark",
			autoLockMinutes: 5,
		});
		const profile = await db.profiles.get(profileId);
		expect(profile?.name).toBe("Ada L");
		expect(profile?.prefs).toEqual({ theme: "dark", autoLockMinutes: 5 });
		await run("profile.update", { theme: "light" });
		expect((await db.profiles.get(profileId))?.prefs).toEqual({
			theme: "light",
			autoLockMinutes: 5,
		});
	});

	it("refuses bad values and a locked profile", async () => {
		expect(await refused("profile.update", { theme: "blue" })).toBe(
			"invalid-input",
		);
		expect(await refused("profile.update", { autoLockMinutes: 0 })).toBe(
			"invalid-input",
		);
		expect(await refused("profile.update", { autoLockMinutes: 1.5 })).toBe(
			"invalid-input",
		);
		expect(await refused("profile.update", { name: "  " })).toBe(
			"invalid-input",
		);
		await run("profile.lock", null);
		expect(await refused("profile.update", { theme: "dark" })).toBe(
			"locked",
		);
	});
});

describe("profile.setAvatar", () => {
	it("stores a staged image and consumes the file", async () => {
		const file = await staging.put(new Uint8Array([137, 80, 78, 71]));
		await run("profile.setAvatar", { file, type: "image/png" });
		const avatar = await db.avatars.get(profileId);
		expect(avatar?.image.type).toBe("image/png");
		expect(new Uint8Array(await avatar!.image.arrayBuffer())).toEqual(
			new Uint8Array([137, 80, 78, 71]),
		);
		// The staged file is gone once taken.
		expect(
			await refused("profile.setAvatar", { file, type: "image/png" }),
		).toBe("rejected");
		await run("profile.setAvatar", { file: null });
		expect(await db.avatars.get(profileId)).toBeUndefined();
	});

	it("refuses other types, oversized images and bad names", async () => {
		const file = await staging.put(new Uint8Array([1]));
		expect(
			await refused("profile.setAvatar", { file, type: "image/svg+xml" }),
		).toBe("invalid-input");
		const big = await staging.put(new Uint8Array(2 * 1024 * 1024 + 1));
		expect(
			await refused("profile.setAvatar", {
				file: big,
				type: "image/png",
			}),
		).toBe("rejected");
		expect(
			await refused("profile.setAvatar", {
				file: "../profiles",
				type: "image/png",
			}),
		).toBe("rejected");
	});
});

describe("leftover staged files", () => {
	// A page that closes between staging a file and sending its command
	// leaves the file behind (0012, Messaging). Unlocking sweeps it, but
	// not a file a page staged moments ago for a command still on its way.
	it("are swept at unlock, apart from fresh ones", async () => {
		let clock = 0;
		const files = createMemoryStaging(() => clock);
		const send = createDispatcher(
			commands,
			createCommandContext(
				db,
				session,
				() => clock,
				() => "UTC",
				files,
			),
		);
		const old = await files.put(new Uint8Array([1]));
		clock = STAGED_FILE_MAX_AGE + 1;
		const fresh = await files.put(new Uint8Array([2]));
		await send("profile.lock", {});
		expect(
			await send("profile.unlock", { profileId, password: null }),
		).toMatchObject({ ok: true });
		await expect(files.take(old)).rejects.toThrow(
			"The staged file is gone.",
		);
		expect([...(await files.take(fresh))]).toEqual([2]);
	});
});

describe("settings.update", () => {
	const ai = {
		provider: LAI_PROVIDERS.CUSTOM,
		baseUrl: "https://example.com/v1",
		apiKey: "sk-secret",
		model: "m",
	};

	it("seals the settings and keeps the part not sent", async () => {
		expect(await getSettings(db, await keys())).toEqual(defaultSettings());
		await run("settings.update", { ai });
		const row = await db.settings.get(profileId);
		expect(new TextDecoder().decode(row!.body)).not.toContain("sk-secret");
		expect(await getSettings(db, await keys())).toEqual({
			ai,
			misc: defaultSettings().misc,
		});
		const misc = { VBMLimit: 1500, VBMSameOriginLimit: 3 };
		await run("settings.update", { misc });
		expect(await getSettings(db, await keys())).toEqual({ ai, misc });
	});

	it("refuses out-of-range limits and unknown providers", async () => {
		expect(
			await refused("settings.update", {
				misc: { VBMLimit: 10, VBMSameOriginLimit: 3 },
			}),
		).toBe("invalid-input");
		expect(
			await refused("settings.update", {
				ai: { ...ai, provider: "Groq" },
			}),
		).toBe("invalid-input");
	});
});

describe("links", () => {
	it("links allowed kinds once, and unlinks", async () => {
		const { id: saveId } = await run<{ id: string }>("save.capture", {
			url: "https://example.com/a",
			title: "A",
			saved: true,
		});
		const { id: noteId } = await run<{ id: string }>("note.create", {
			content: "Hello",
		});
		await run("link.create", { fromId: noteId, toId: saveId });
		await run("link.create", { fromId: noteId, toId: saveId });
		expect(await db.links.count()).toBe(1);
		expect(
			(await listNotesFor(db, await keys(), saveId)).map(({ id }) => id),
		).toEqual([noteId]);
		await run("link.delete", { fromId: noteId, toId: saveId });
		expect(await db.links.count()).toBe(0);
	});

	it("links a reminder to a task but not the other way", async () => {
		const { id: taskId } = await run<{ id: string }>("task.create", {
			information: "Pay rent",
			schedule: { kind: "anytime" },
		});
		const { id: reminderId } = await run<{ id: string }>(
			"reminder.create",
			{ message: "Rent", target: 10_000 },
		);
		await run("link.create", { fromId: reminderId, toId: taskId });
		expect(
			await refused("link.create", { fromId: taskId, toId: reminderId }),
		).toBe("rejected");
		// Deleting the task drops the link.
		await run("task.delete", { id: taskId });
		expect(await db.links.count()).toBe(0);
	});

	it("refuses records of another profile", async () => {
		const { id: noteId } = await run<{ id: string }>("note.create", {
			content: "Mine",
		});
		await run("profile.create", { name: "Grace", password: null });
		const { id: saveId } = await run<{ id: string }>("save.capture", {
			url: "https://example.com/b",
			title: "B",
			saved: true,
		});
		expect(
			await refused("link.create", { fromId: noteId, toId: saveId }),
		).toBe("rejected");
	});
});
