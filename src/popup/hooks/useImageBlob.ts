import { useEffect, useState } from "react";
import { littleDB } from "../../storage/pageDB";
import { getImageBlob } from "../../storage/repositories";
import { useProfileKeys } from "./useSession";

export const useImageBlob = (
	imageId: string | undefined,
	mimeType: string | undefined,
): Blob | undefined => {
	const keys = useProfileKeys();
	const [blob, setBlob] = useState<Blob | undefined>(undefined);

	useEffect(() => {
		if (!keys || !imageId || !mimeType) {
			return;
		}
		let active = true;
		void getImageBlob(littleDB, keys, imageId, mimeType).then(
			(loaded) => {
				if (active) setBlob(loaded);
			},
			() => {
				if (active) setBlob(undefined);
			},
		);
		return () => {
			active = false;
		};
	}, [keys, imageId, mimeType]);

	return keys && imageId ? blob : undefined;
};
