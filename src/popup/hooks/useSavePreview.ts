import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { openAsset } from "../../storage/keys";
import { PREVIEW_KIND, PREVIEW_TYPE } from "../../storage/repositories";
import { littleDB } from "../../storage/pageDB";
import type { AssetRow } from "../../storage/schema";
import { useProfileKeys } from "./useSession";

const usePreview = (saveId: string | undefined, enabled: boolean) => {
	const keys = useProfileKeys();
	const profileId = keys?.profileId;
	const row = useLiveQuery(
		async (): Promise<AssetRow | null | undefined> =>
			!enabled || profileId === undefined || saveId === undefined
				? undefined
				: ((await littleDB.assets
						.where("[profileId+ownerId]")
						.equals([profileId, saveId])
						.filter((asset) => asset.kind === PREVIEW_KIND)
						.first()) ?? null),
		[profileId, saveId, enabled],
		undefined,
	);
	const [opened, setOpened] = useState<{ row: AssetRow; blob: Blob } | null>(
		null,
	);
	useEffect(() => {
		if (!keys) {
			setOpened(null);
			return;
		}
		if (!row) return;
		let active = true;
		openAsset(keys, row.id, row.body).then(
			(bytes) => {
				if (active) {
					setOpened({
						row,
						blob: new Blob([bytes.slice()], { type: PREVIEW_TYPE }),
					});
				}
			},
			(error: unknown) => {
				console.warn("Could not open a page preview.", error);
			},
		);
		return () => {
			active = false;
		};
	}, [keys, row]);
	// The save's last preview stays while a newer capture is opened, so a
	// background capture does not flash the placeholder.
	return row && opened?.row.ownerId === row.ownerId ? opened.blob : undefined;
};

export const useSavePreview = (saveId: string | undefined) =>
	usePreview(saveId, true);

// Opens the preview only once its element nears the viewport.
export const useLazySavePreview = (saveId: string | undefined) => {
	const [isIntersecting, setIsIntersecting] = useState(false);
	const elementRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const element = elementRef.current;
		if (!element) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsIntersecting(true);
					observer.unobserve(element);
				}
			},
			{ rootMargin: "240px" },
		);
		observer.observe(element);
		return () => observer.unobserve(element);
	}, []);
	return { preview: usePreview(saveId, isIntersecting), elementRef };
};
