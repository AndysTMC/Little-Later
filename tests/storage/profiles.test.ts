// @vitest-environment node
// Node, not jsdom: jsdom has its own Uint8Array, so rows cloned by
// fake-indexeddb fail instanceof checks inside Dexie and lose their bytes.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvelopeError, newKdfParams } from "little-shared/utils/envelope";
import { importProfileKeys, openBody, sealBody } from "../../src/storage/keys";
import {
	ProfileError,
	changePassword,
	createProfile,
	deleteProfile,
	lockProfile,
	unlockProfile,
} from "../../src/storage/profiles";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	createMemorySessionStore,
	type SessionStore,
} from "../../src/storage/session";

const fast = { kdf: () => newKdfParams(1_000) };
const now = Date.UTC(2026, 9, 28);

let db: LittleDB;
let session: SessionStore;

beforeEach(async () => {
	db = openLittleDB(`little-test-${crypto.randomUUID()}`);
	await db.open();
	session = createMemorySessionStore();
});

afterEach(async () => {
	await db.delete();
});

const keysNow = async () => {
	const current = await session.get();
	if (!current) throw new Error("locked");
	return importProfileKeys(current);
};

const addNote = async (profileId: string, text: string) => {
	const keys = await keysNow();
	const id = crypto.randomUUID();
	const sealed = await sealBody(keys, "notes", id, { text });
	await db.notes.add({
		id,
		profileId,
		createdAt: now,
		updatedAt: now,
		privacy: "private",
		...sealed,
	});
	return id;
};

const readNote = async (id: string) => {
	const row = await db.notes.get(id);
	if (!row) throw new Error("missing");
	return openBody<{ text: string }>(await keysNow(), "notes", id, row.body);
};

describe("password-protected profile", () => {
	it("is unlocked after creation and stores no raw key", async () => {
		const id = await createProfile(
			db,
			session,
			{ name: "Ada", password: "pw", now },
			fast,
		);
		const row = await db.profiles.get(id);
		expect(row?.protection).toBe("password");
		expect(row?.keys).toHaveLength(1);
		expect(row?.keys[0]).toHaveProperty("wrapped");
		expect(row?.keys[0]).not.toHaveProperty("raw");
		expect((await session.get())?.profileId).toBe(id);
	});

	it("reads its records again after lock and unlock", async () => {
		const id = await createProfile(
			db,
			session,
			{ name: "Ada", password: "pw", now },
			fast,
		);
		const noteId = await addNote(id, "hello");
		await lockProfile(session);
		expect(await session.get()).toBeNull();

		await unlockProfile(db, session, id, "pw");
		expect(await readNote(noteId)).toEqual({ text: "hello" });
	});

	it("stores no plaintext in the row", async () => {
		const id = await createProfile(
			db,
			session,
			{ name: "Ada", password: "pw", now },
			fast,
		);
		const noteId = await addNote(id, "very secret words");
		const row = await db.notes.get(noteId);
		expect(new TextDecoder().decode(row?.body)).not.toContain("secret");
	});

	it("refuses a wrong or missing password", async () => {
		const id = await createProfile(
			db,
			session,
			{ name: "Ada", password: "pw", now },
			fast,
		);
		await lockProfile(session);
		await expect(unlockProfile(db, session, id, "nope")).rejects.toThrow(
			EnvelopeError,
		);
		await expect(unlockProfile(db, session, id, null)).rejects.toThrow(
			ProfileError,
		);
		expect(await session.get()).toBeNull();
	});

	it("changes the password without touching records", async () => {
		const id = await createProfile(
			db,
			session,
			{ name: "Ada", password: "old", now },
			fast,
		);
		const noteId = await addNote(id, "kept");
		const before = (await db.notes.get(noteId))?.body;

		await changePassword(db, id, "old", "new", fast);
		await lockProfile(session);
		await expect(unlockProfile(db, session, id, "old")).rejects.toThrow();
		await unlockProfile(db, session, id, "new");

		expect((await db.notes.get(noteId))?.body).toEqual(before);
		expect(await readNote(noteId)).toEqual({ text: "kept" });
	});

	it("can drop its password", async () => {
		const id = await createProfile(
			db,
			session,
			{ name: "Ada", password: "pw", now },
			fast,
		);
		await changePassword(db, id, "pw", null);
		expect((await db.profiles.get(id))?.protection).toBe("none");
		await lockProfile(session);
		await unlockProfile(db, session, id, null);
		expect((await session.get())?.profileId).toBe(id);
	});
});

describe("profile without a password", () => {
	it("is marked not encrypted at rest and unlocks without one", async () => {
		const id = await createProfile(db, session, {
			name: "Bo",
			password: null,
			now,
		});
		const noteId = await addNote(id, "plain profile");
		expect((await db.profiles.get(id))?.protection).toBe("none");
		await lockProfile(session);
		await unlockProfile(db, session, id, null);
		expect(await readNote(noteId)).toEqual({ text: "plain profile" });
	});
});

describe("isolation between profiles", () => {
	it("keeps one unlocked profile and separate keys", async () => {
		const a = await createProfile(db, session, {
			name: "A",
			password: null,
			now,
		});
		const noteId = await addNote(a, "from A");
		const row = await db.notes.get(noteId);

		const b = await createProfile(db, session, {
			name: "B",
			password: null,
			now,
		});
		expect((await session.get())?.profileId).toBe(b);

		// B's keys cannot open A's row, even relabelled as B's.
		const keysB = await keysNow();
		await expect(
			openBody(keysB, "notes", noteId, row!.body),
		).rejects.toThrow(EnvelopeError);
	});

	it("gives each profile its own index key", async () => {
		await createProfile(db, session, { name: "A", password: null, now });
		const indexA = (await session.get())?.indexKey;
		await createProfile(db, session, { name: "B", password: null, now });
		expect((await session.get())?.indexKey).not.toBe(indexA);
	});
});

describe("deleting a profile", () => {
	it("removes its keys, rows and session, and leaves others alone", async () => {
		const keep = await createProfile(db, session, {
			name: "Keep",
			password: null,
			now,
		});
		const keptNote = await addNote(keep, "stays");
		const gone = await createProfile(db, session, {
			name: "Gone",
			password: null,
			now,
		});
		await addNote(gone, "goes");
		await db.links.add({
			id: crypto.randomUUID(),
			profileId: gone,
			fromId: "a",
			toId: "b",
			createdAt: now,
		});

		await deleteProfile(db, session, gone, null);

		expect(await session.get()).toBeNull();
		expect(await db.profiles.get(gone)).toBeUndefined();
		expect(await db.notes.count()).toBe(1);
		expect(await db.links.count()).toBe(0);
		await unlockProfile(db, session, keep, null);
		expect(await readNote(keptNote)).toEqual({ text: "stays" });
	});
});

describe("schema", () => {
	it("rejects a second save with the same urlKey in one profile", async () => {
		const base = {
			profileId: "p",
			keyId: 1,
			createdAt: now,
			updatedAt: now,
			body: new Uint8Array([1]),
			urlKey: "same",
			originKey: "o",
			saved: 1 as const,
			browsed: 0 as const,
			browsedAt: now,
			privacy: "private" as const,
		};
		await db.saves.add({ id: "1", ...base });
		await expect(db.saves.add({ id: "2", ...base })).rejects.toThrow();
		await db.saves.add({ id: "3", ...base, profileId: "q" });
		expect(await db.saves.count()).toBe(2);
	});
});

describe("deleting a protected profile", () => {
	const setup = async () => {
		const id = await createProfile(
			db,
			session,
			{ name: "Ada", password: "pw", now },
			fast,
		);
		const noteId = await addNote(id, "keep me");
		return { id, noteId };
	};

	it("refuses a wrong or missing password and keeps everything", async () => {
		const { id, noteId } = await setup();
		await expect(deleteProfile(db, session, id, "nope")).rejects.toThrow(
			EnvelopeError,
		);
		await expect(deleteProfile(db, session, id, null)).rejects.toThrow(
			ProfileError,
		);
		expect((await session.get())?.profileId).toBe(id);
		expect((await db.profiles.get(id))?.keys).toHaveLength(1);
		expect(await readNote(noteId)).toEqual({ text: "keep me" });
	});

	it("deletes with the right password", async () => {
		const { id } = await setup();
		await deleteProfile(db, session, id, "pw");
		expect(await db.profiles.get(id)).toBeUndefined();
		expect(await db.notes.count()).toBe(0);
	});

	it("finishes an interrupted delete without the password", async () => {
		const { id } = await setup();
		// The keys are already shredded, as after a delete that stopped
		// before removing rows.
		await db.profiles.update(id, { keys: [] });
		await deleteProfile(db, session, id, null);
		expect(await db.profiles.get(id)).toBeUndefined();
		expect(await db.notes.count()).toBe(0);
	});
});

describe("password rules", () => {
	it.each([[""], [" pw"], ["pw "], ["\tpw"]])(
		"refuses %j as a new password",
		async (password) => {
			await expect(
				createProfile(db, session, { name: "A", password, now }, fast),
			).rejects.toThrow(ProfileError);
			expect(await db.profiles.count()).toBe(0);

			const id = await createProfile(
				db,
				session,
				{ name: "B", password: "pw", now },
				fast,
			);
			await expect(
				changePassword(db, id, "pw", password, fast),
			).rejects.toThrow(ProfileError);
			await lockProfile(session);
			await unlockProfile(db, session, id, "pw");
		},
	);
});

describe("a profile without keys", () => {
	it("cannot be unlocked or have its password changed", async () => {
		const id = await createProfile(
			db,
			session,
			{ name: "Ada", password: "pw", now },
			fast,
		);
		await db.profiles.update(id, { keys: [] });
		await expect(unlockProfile(db, session, id, "pw")).rejects.toThrow(
			/no keys/,
		);
		await expect(changePassword(db, id, "pw", "new", fast)).rejects.toThrow(
			/no keys/,
		);
		expect((await db.profiles.get(id))?.protection).toBe("password");
	});
});
