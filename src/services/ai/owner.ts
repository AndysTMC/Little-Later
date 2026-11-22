import { importProfileKeys, type ProfileKeys } from "../../storage/keys";
import { sessionStore, type UnlockedSession } from "../../storage/session";
import { send } from "../../utils/send";

// The unlock an AI request belongs to: the profile open when it started,
// for as long as it stays open. Every read, provider call and write in the
// request goes through it, so work still running after a lock or a switch
// cannot read the next profile's records, send them to this profile's
// provider, or write into it. A lock ends the work even if the same
// profile is opened again at once. Writes also carry the owner to the
// worker, which refuses them in its write queue once that unlock is over
// (registry.ts, DispatchOptions).

export class ProfileChangedError extends Error {
	constructor() {
		super("The profile was locked or changed, so this was stopped.");
		this.name = "ProfileChangedError";
	}
}

export type AIOwner = {
	profileId: string;
	// The unlock it belongs to: a lock ends it, even if the same profile
	// is opened again.
	unlockId: string;
	// Fails once the profile has locked, or another profile is open.
	assertCurrent: () => Promise<void>;
	keys: () => Promise<ProfileKeys>;
	send: typeof send;
};

export const ownerOf = ({
	profileId,
	unlockId,
}: Pick<UnlockedSession, "profileId" | "unlockId">): AIOwner => {
	const unlocked = async () => {
		const session = await sessionStore.get();
		if (session?.profileId !== profileId || session.unlockId !== unlockId) {
			throw new ProfileChangedError();
		}
		return session;
	};
	return {
		profileId,
		unlockId,
		assertCurrent: async () => {
			await unlocked();
		},
		keys: async () => importProfileKeys(await unlocked()),
		send: (name, input) => send(name, input, { profileId, unlockId }),
	};
};

// The owner for a request starting now.
export const currentOwner = async (): Promise<AIOwner> => {
	const session = await sessionStore.get();
	if (!session) {
		throw new Error("Unlock a profile first.");
	}
	return ownerOf(session);
};
