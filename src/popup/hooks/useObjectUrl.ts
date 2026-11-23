import { useEffect, useMemo } from "react";
import { toSafeImageBlob } from "../../utils/safeImageBlob";

const pendingRevokes = new Map<string, ReturnType<typeof setTimeout>>();

export const useObjectUrl = (
	blob: Blob | null | undefined,
): string | undefined => {
	const url = useMemo(
		() => (blob ? URL.createObjectURL(toSafeImageBlob(blob)) : undefined),
		[blob],
	);

	useEffect(() => {
		if (!url) return;
		const timer = pendingRevokes.get(url);
		if (timer !== undefined) {
			clearTimeout(timer);
			pendingRevokes.delete(url);
		}
		return () => {
			pendingRevokes.set(
				url,
				setTimeout(() => {
					pendingRevokes.delete(url);
					URL.revokeObjectURL(url);
				}, 0),
			);
		};
	}, [url]);

	return url;
};
