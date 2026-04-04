import { useState, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../utils/db";
import { LVBMPreview } from "little-shared/types";

export const useLazyVBMImage = (
	id: number | undefined,
): {
	preview: LVBMPreview | undefined;
	elementRef: React.RefObject<HTMLDivElement>;
} => {
	const [isIntersecting, setIsIntersecting] = useState(false);
	const elementRef = useRef<HTMLDivElement>(null);

	const preview = useLiveQuery(
		async () => {
			if (!isIntersecting || id === undefined) {
				return undefined;
			}
			return db.vbmPreviewTbl.get(id);
		},
		[id, isIntersecting],
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

	return { preview, elementRef };
};
