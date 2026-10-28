import { staging } from "../storage/staging";
import { send } from "./send";

// Avatars are binary, so they reach the worker through a staging file
// (decision 0012, Messaging). Null removes the avatar.
export const sendAvatar = async (avatar: Blob | null): Promise<void> => {
	if (avatar === null) {
		await send("profile.setAvatar", { file: null });
		return;
	}
	const file = await staging.put(new Uint8Array(await avatar.arrayBuffer()));
	await send("profile.setAvatar", { file, type: avatar.type });
};
