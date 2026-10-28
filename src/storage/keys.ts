import {
	EnvelopeError,
	deriveContentKeys,
	importIndexKey,
	openBytes,
	sealBytes,
	openValue,
	readEnvelopeHeader,
	sealValue,
	type ContentKeys,
} from "little-shared/utils/envelope";
import type { SealedTable } from "./schema";
import { fromBase64, type UnlockedSession } from "./session";

// Non-extractable keys a context imports once from the session bytes
// (decision 0010). No raw copy is kept here.
export type ProfileKeys = {
	profileId: string;
	current: ContentKeys;
	byId: Map<number, ContentKeys>;
	index: CryptoKey;
};

export const importProfileKeys = async (
	session: UnlockedSession,
): Promise<ProfileKeys> => {
	const byId = new Map<number, ContentKeys>();
	for (const [keyId, root] of Object.entries(session.rootKeys)) {
		byId.set(
			Number(keyId),
			await deriveContentKeys(fromBase64(root), Number(keyId)),
		);
	}
	const current = byId.get(session.currentKeyId);
	if (!current) {
		throw new EnvelopeError(
			`Session has no key ${session.currentKeyId} for its current key id.`,
		);
	}
	return {
		profileId: session.profileId,
		current,
		byId,
		index: await importIndexKey(fromBase64(session.indexKey)),
	};
};

// Assets are sealed as raw bytes under the asset subkey; every other sealed
// table holds a MessagePack body under the content subkey.
type BodyTable = Exclude<SealedTable, "assets">;

// A sealed row's body. The AAD names the table, row and profile, so a body
// copied to another row or profile does not open.
const bodyLocation = (table: SealedTable, id: string, profileId: string) => ({
	table,
	id,
	profileId,
	field: "body",
});

export const sealBody = async <T>(
	keys: ProfileKeys,
	table: BodyTable,
	id: string,
	content: T,
): Promise<{ keyId: number; body: Uint8Array }> => ({
	keyId: keys.current.keyId,
	body: await sealValue(
		keys.current,
		bodyLocation(table, id, keys.profileId),
		content,
	),
});

// Opens with the key the envelope names, so rows still under an old key
// read correctly while a re-key runs.
const keysFor = (keys: ProfileKeys, body: Uint8Array): ContentKeys => {
	const { keyId } = readEnvelopeHeader(body);
	const contentKeys = keys.byId.get(keyId);
	if (!contentKeys) {
		throw new EnvelopeError(`Profile has no key ${keyId}.`);
	}
	return contentKeys;
};

export const openBody = async <T>(
	keys: ProfileKeys,
	table: BodyTable,
	id: string,
	body: Uint8Array,
): Promise<T> =>
	openValue<T>(
		keysFor(keys, body),
		bodyLocation(table, id, keys.profileId),
		body,
	);

export const sealAsset = async (
	keys: ProfileKeys,
	id: string,
	bytes: Uint8Array,
): Promise<{ keyId: number; body: Uint8Array }> => ({
	keyId: keys.current.keyId,
	body: await sealBytes(
		keys.current.asset,
		keys.current.keyId,
		bodyLocation("assets", id, keys.profileId),
		bytes,
	),
});

export const openAsset = async (
	keys: ProfileKeys,
	id: string,
	body: Uint8Array,
): Promise<Uint8Array> =>
	openBytes(
		keysFor(keys, body).asset,
		bodyLocation("assets", id, keys.profileId),
		body,
	);
