import {
	EnvelopeError,
	deriveContentKeys,
	importIndexKey,
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
	table: SealedTable,
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
export const openBody = async <T>(
	keys: ProfileKeys,
	table: SealedTable,
	id: string,
	body: Uint8Array,
): Promise<T> => {
	const { keyId } = readEnvelopeHeader(body);
	const contentKeys = keys.byId.get(keyId);
	if (!contentKeys) {
		throw new EnvelopeError(`Profile has no key ${keyId}.`);
	}
	return openValue<T>(
		contentKeys,
		bodyLocation(table, id, keys.profileId),
		body,
	);
};
