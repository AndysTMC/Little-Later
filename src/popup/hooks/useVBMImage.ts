import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../utils/db";
import { LVBMPreview } from "little-shared/types";

export const useVBMImage = (
	id: number | undefined,
): {
	preview: LVBMPreview | undefined;
} => {
	const preview = useLiveQuery(
		async () => {
			if (id === undefined) {
				return undefined;
			}
			return db.vbmPreviewTbl.get(id);
		},
		[id],
		undefined,
	);

	return { preview };
};
