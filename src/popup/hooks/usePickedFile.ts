import { useCallback, useContext, useEffect, useState } from "react";
import { importProfileKeys } from "../../storage/keys";
import { sessionStore } from "../../storage/session";
import { staging } from "../../storage/staging";
import { UIStateContext } from "../contexts/UIStateContext";
import { asPickedFiles, pickKey, type PickedFile } from "../filePick";

// `id` is the staged file's name, to remove one file from the slot.
export type PickedBlob = { id: string; blob: Blob; name: string; size: number };

// The files uploaded for a slot on the shared upload screen (filePick.ts),
// if any are waiting. They stay until `clear` is called: call it once they
// have been used or are no longer wanted.
const usePickedFile = (slot: string, options?: { sensitive?: boolean }) => {
	const sensitive = options?.sensitive ?? false;
	const { getDraft, setDraft, clearDraft } = useContext(UIStateContext);
	const key = pickKey(slot);
	const [files, setFiles] = useState<Array<PickedBlob>>([]);

	useEffect(() => {
		const picked = asPickedFiles(getDraft(key));
		if (picked.length === 0) {
			return;
		}
		let active = true;
		const load = async (): Promise<Array<PickedBlob>> => {
			const needsKeys =
				sensitive || picked.some((meta) => Boolean(meta.encrypted));
			let keys: Awaited<ReturnType<typeof importProfileKeys>> | undefined;
			if (needsKeys) {
				const session = await sessionStore.get();
				if (
					!session ||
					picked.some(
						(meta) =>
							!meta.encrypted ||
							meta.profileId !== session.profileId ||
							meta.unlockId !== session.unlockId,
					)
				) {
					await Promise.all(
						picked.map((meta) =>
							staging.discard(meta.file).catch(() => undefined),
						),
					);
					throw new Error("Staged file session mismatch.");
				}
				keys = await importProfileKeys(session);
			}
			return Promise.all(
				picked.map(async (meta: PickedFile) => ({
					id: meta.file,
					// Backed by the staged file on disk (or decrypted from
					// sealed OPFS bytes for sensitive slots).
					blob: (
						await staging.readBlob(
							meta.file,
							needsKeys ? keys : undefined,
						)
					).slice(0, undefined, meta.type),
					name: meta.name,
					size: meta.size,
				})),
			);
		};
		load().then(
			(loaded) => {
				if (active) setFiles(loaded);
			},
			() => {
				// Swept as leftovers, session changed, or already used: nothing to offer.
				clearDraft(key);
			},
		);
		return () => {
			active = false;
		};
	}, [key, sensitive, getDraft, clearDraft]);

	const clear = useCallback(async () => {
		const picked = asPickedFiles(getDraft(key));
		clearDraft(key);
		setFiles([]);
		await Promise.all(picked.map((meta) => staging.discard(meta.file)));
	}, [key, getDraft, clearDraft]);

	// Removes one file, as when it has been used and the others have not.
	const remove = useCallback(
		async (id: string) => {
			const left = asPickedFiles(getDraft(key)).filter(
				(meta) => meta.file !== id,
			);
			if (left.length === 0) {
				clearDraft(key);
			} else {
				setDraft(key, left);
			}
			setFiles((current) => current.filter((file) => file.id !== id));
			await staging.discard(id);
		},
		[key, getDraft, setDraft, clearDraft],
	);

	return {
		files,
		remove,
		// The first file, for screens that ask for one.
		blob: files[0]?.blob ?? null,
		name: files[0]?.name ?? null,
		clear,
	};
};

export { usePickedFile };
