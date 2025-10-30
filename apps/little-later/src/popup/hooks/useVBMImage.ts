import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../utils/db";
import { LVBMPreview } from "little-shared/types";
import { useLocalSocket } from "./useLocalSocket";
import { getVisualBMPreview } from "../../services/visualBM";

export const useVBMImage = (
	id: number | undefined,
): {
	preview: LVBMPreview | undefined;
} => {
	const dbResult = useLiveQuery(
		async () => {
			if (id === undefined) {
				return undefined;
			}
			return db.vbmPreviewTbl.get(id);
		},
		[id],
		undefined,
	);

	const socket = useLocalSocket();

	const [localResult, setLocalResult] = useState<LVBMPreview | undefined>(
		undefined,
	);

	useEffect(() => {
		socket?.on("vbmPreviewsChange", () => {
			if (!id) return;
			getVisualBMPreview(id).then((vbmPreview) => {
				if (!vbmPreview) return;
				setLocalResult({
					vbmId: id,
					blob: vbmPreview,
				});
			});
		});
		return () => {
			socket?.off("vbmPreviewsChange");
		};
	}, [socket, id]);

	useEffect(() => {
		if (!id) return;
		getVisualBMPreview(id).then((vbmPreview) => {
			if (!vbmPreview) return;
			setLocalResult({
				vbmId: id,
				blob: vbmPreview,
			});
		});
	}, [setLocalResult, id]);

	return { preview: socket ? localResult : dbResult };
};
