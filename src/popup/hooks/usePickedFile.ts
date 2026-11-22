import { useCallback, useContext, useEffect, useState } from "react";
import { staging } from "../../storage/staging";
import { UIStateContext } from "../contexts/UIStateContext";
import { asPickedFiles, pickKey, type PickedFile } from "../filePick";

// `id` is the staged file's name, to remove one file from the slot.
export type PickedBlob = { id: string; blob: Blob; name: string; size: number };

// The files uploaded for a slot on the shared upload screen (filePick.ts),
// if any are waiting. They stay until `clear` is called: call it once they
// have been used or are no longer wanted.
const usePickedFile = (slot: string) => {
	const { getDraft, setDraft, clearDraft } = useContext(UIStateContext);
	const key = pickKey(slot);
	const [files, setFiles] = useState<Array<PickedBlob>>([]);

	useEffect(() => {
		const picked = asPickedFiles(getDraft(key));
		if (picked.length === 0) {
			return;
		}
		let active = true;
		Promise.all(
			picked.map(async (meta: PickedFile) => ({
				id: meta.file,
				// Backed by the staged file on disk, not read into memory.
				blob: (await staging.readBlob(meta.file)).slice(
					0,
					undefined,
					meta.type,
				),
				name: meta.name,
				size: meta.size,
			})),
		).then(
			(loaded) => {
				if (active) setFiles(loaded);
			},
			() => {
				// Swept as leftovers, or already used: nothing to offer.
				clearDraft(key);
			},
		);
		return () => {
			active = false;
		};
	}, [key, getDraft, clearDraft]);

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
