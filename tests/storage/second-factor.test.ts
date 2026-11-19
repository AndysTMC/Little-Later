// @vitest-environment node
// Node, not jsdom: see tests/storage/profiles.test.ts.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newKdfParams } from "little-shared/utils/envelope";
import { importProfileKeys, openBody, sealBody } from "../../src/storage/keys";
import {
	NEEDS_SECOND_FACTOR,
	addAuthenticator,
	changePassword,
	createProfile,
	deleteProfile,
	disableSecondFactor,
	lockProfile,
	removeAuthenticator,
	replaceRecoveryCode,
	unlockProfile,
} from "../../src/storage/profiles";
import { openLittleDB, type LittleDB } from "../../src/storage/schema";
import {
	normalizeRecoveryCode,
	type Factor,
} from "../../src/storage/secondFactor";
import {
	createMemorySessionStore,
	type SessionStore,
} from "../../src/storage/session";

// Two-factor unlock (decision 0015): with it on, the password alone opens
// nothing, nor does the factor alone; any registered factor with the
// password does, and so does the recovery code.

const fast = { kdf: () => newKdfParams(1_000) };
const now = Date.UTC(2026, 10, 19);
const PASSWORD = "correct horse battery";

let db: LittleDB;
let session: SessionStore;
let profileId: string;
let noteId: string;

// An authenticator as the page sees it: a credential id, and the PRF
// output it gives for a salt (here a fixed secret per key).
const key = (seed: number) => ({
	credentialId: new Uint8Array(16).fill(seed),
	prfSalt: new Uint8Array(32).fill(seed + 100),
	secret: new Uint8Array(32).fill(seed + 200),
	name: `Key ${seed}`,
});
const tap = (authenticator: ReturnType<typeof key>): Factor => ({
	kind: "authenticator",
	credentialId: authenticator.credentialId,
	secret: authenticator.secret,
});

const readNote = async () => {
	const current = await session.get();
	const keys = await importProfileKeys(current!);
	const row = (await db.notes.get(noteId))!;
	return openBody<{ text: string }>(keys, "notes", noteId, row.body);
};

beforeEach(async () => {
	db = openLittleDB(`little-test-${crypto.randomUUID()}`);
	await db.open();
	session = createMemorySessionStore();
	profileId = await createProfile(
		db,
		session,
		{ name: "Ada", password: PASSWORD, now },
		fast,
	);
	const keys = await importProfileKeys((await session.get())!);
	noteId = crypto.randomUUID();
	await db.notes.add({
		id: noteId,
		profileId,
		createdAt: now,
		updatedAt: now,
		privacy: "private",
		...(await sealBody(keys, "notes", noteId, { text: "secret note" })),
	});
});

afterEach(async () => {
	await db.delete();
});

const turnOn = async (authenticator = key(1)) => {
	const { recoveryCode } = await addAuthenticator(
		db,
		session,
		profileId,
		PASSWORD,
		authenticator,
		now,
		fast,
	);
	await lockProfile(session);
	return recoveryCode!;
};

describe("two-factor unlock", () => {
	it("needs the password and the key together", async () => {
		const recoveryCode = await turnOn();
		expect(recoveryCode).toMatch(/^([A-Z2-9]{5}-){4}[A-Z2-9]{5}$/);
		const row = (await db.profiles.get(profileId))!;
		// No wrap opens with the password alone.
		expect(row.keys).toEqual([]);

		await expect(
			unlockProfile(db, session, profileId, PASSWORD),
		).rejects.toThrow(NEEDS_SECOND_FACTOR);
		await expect(
			unlockProfile(
				db,
				session,
				profileId,
				"wrong password",
				tap(key(1)),
			),
		).rejects.toThrow(/Wrong password/);
		await expect(
			unlockProfile(db, session, profileId, PASSWORD, tap(key(2))),
		).rejects.toThrow(/isn't set up/);
		await expect(
			unlockProfile(db, session, profileId, PASSWORD, {
				kind: "authenticator",
				credentialId: key(1).credentialId,
				secret: new Uint8Array(32).fill(9),
			}),
		).rejects.toThrow(/doesn't open/);
		expect(await session.get()).toBeNull();

		await unlockProfile(db, session, profileId, PASSWORD, tap(key(1)));
		expect(await readNote()).toEqual({ text: "secret note" });
	});

	it("opens with the recovery code, typed loosely, and a new code replaces it", async () => {
		const recoveryCode = await turnOn();
		const loose = normalizeRecoveryCode(recoveryCode).toLowerCase();
		await unlockProfile(db, session, profileId, PASSWORD, {
			kind: "recovery",
			code: loose.match(/.{1,5}/g)!.join(" "),
		});
		expect(await readNote()).toEqual({ text: "secret note" });

		const next = await replaceRecoveryCode(
			db,
			session,
			profileId,
			PASSWORD,
		);
		await lockProfile(session);
		await expect(
			unlockProfile(db, session, profileId, PASSWORD, {
				kind: "recovery",
				code: recoveryCode,
			}),
		).rejects.toThrow(/recovery code doesn't open/);
		await unlockProfile(db, session, profileId, PASSWORD, {
			kind: "recovery",
			code: next,
		});
		expect(await readNote()).toEqual({ text: "secret note" });
	});

	it("keeps every key working after a password change", async () => {
		await turnOn();
		await unlockProfile(db, session, profileId, PASSWORD, tap(key(1)));
		await addAuthenticator(db, session, profileId, PASSWORD, key(2), now);
		await changePassword(db, profileId, PASSWORD, "a new password", fast);
		await lockProfile(session);
		await expect(
			unlockProfile(db, session, profileId, PASSWORD, tap(key(2))),
		).rejects.toThrow(/Wrong password/);
		for (const authenticator of [key(1), key(2)]) {
			await unlockProfile(
				db,
				session,
				profileId,
				"a new password",
				tap(authenticator),
			);
			expect(await readNote()).toEqual({ text: "secret note" });
		}
		await expect(
			changePassword(db, profileId, "a new password", null),
		).rejects.toThrow(/Turn off two-factor unlock/);
	});

	it("stops a removed key, and turns off with the last one", async () => {
		await turnOn();
		await unlockProfile(db, session, profileId, PASSWORD, tap(key(1)));
		await addAuthenticator(db, session, profileId, PASSWORD, key(2), now);
		await removeAuthenticator(
			db,
			session,
			profileId,
			PASSWORD,
			key(1).credentialId,
		);
		await lockProfile(session);
		await expect(
			unlockProfile(db, session, profileId, PASSWORD, tap(key(1))),
		).rejects.toThrow(/isn't set up/);
		await unlockProfile(db, session, profileId, PASSWORD, tap(key(2)));
		await removeAuthenticator(
			db,
			session,
			profileId,
			PASSWORD,
			key(2).credentialId,
			fast,
		);
		await lockProfile(session);
		expect(
			(await db.profiles.get(profileId))!.secondFactor,
		).toBeUndefined();
		await unlockProfile(db, session, profileId, PASSWORD);
		expect(await readNote()).toEqual({ text: "secret note" });
	});

	it("turns off back to the password alone, and needs the right one", async () => {
		await turnOn();
		await unlockProfile(db, session, profileId, PASSWORD, tap(key(1)));
		await expect(
			disableSecondFactor(db, session, profileId, "wrong", fast),
		).rejects.toThrow(/Wrong password/);
		await disableSecondFactor(db, session, profileId, PASSWORD, fast);
		await lockProfile(session);
		await unlockProfile(db, session, profileId, PASSWORD);
		expect(await readNote()).toEqual({ text: "secret note" });
	});

	it("is changed only by the unlocked profile, with its password", async () => {
		await expect(
			addAuthenticator(
				db,
				session,
				profileId,
				"wrong",
				key(1),
				now,
				fast,
			),
		).rejects.toThrow(/Wrong password/);
		await lockProfile(session);
		await expect(
			addAuthenticator(
				db,
				session,
				profileId,
				PASSWORD,
				key(1),
				now,
				fast,
			),
		).rejects.toThrow(/Unlock this profile/);
		expect(
			(await db.profiles.get(profileId))!.secondFactor,
		).toBeUndefined();
	});

	it("can be deleted with the password alone, which reveals nothing", async () => {
		await turnOn();
		await expect(
			deleteProfile(db, session, profileId, "wrong"),
		).rejects.toThrow(/Wrong password/);
		await deleteProfile(db, session, profileId, PASSWORD);
		expect(await db.profiles.get(profileId)).toBeUndefined();
		expect(await db.notes.count()).toBe(0);
	});
});
