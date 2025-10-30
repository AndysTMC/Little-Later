import { useState, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../utils/db";
import { LVBMPreview } from "little-shared/types";
import { useLocalSocket } from "./useLocalSocket";
import { getVisualBMPreview } from "../../services/visualBM";

export const useLazyVBMImage = (
	id: number | undefined,
): {
	preview: LVBMPreview | undefined;
	elementRef: React.RefObject<HTMLDivElement>;
} => {
	const [isIntersecting, setIsIntersecting] = useState(false);
	const elementRef = useRef<HTMLDivElement>(null);

	const dbResult = useLiveQuery(
		async () => {
			if (!isIntersecting || id === undefined) {
				return undefined;
			}
			return db.vbmPreviewTbl.get(id);
		},
		[id, isIntersecting],
		undefined,
	);

	const socket = useLocalSocket();

	const [localResult, setLocalResult] = useState<LVBMPreview | undefined>(
		undefined,
	);

	useEffect(() => {
		const currentElement = elementRef.current;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsIntersecting(true);
					if (currentElement) {
						observer.unobserve(currentElement);
					}
				}
			},
			{
				rootMargin: "240px",
			},
		);

		if (currentElement) {
			observer.observe(currentElement);
		}

		return () => {
			if (currentElement) {
				observer.unobserve(currentElement);
			}
		};
	}, []);

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

	return { preview: socket ? localResult : dbResult, elementRef };
};
