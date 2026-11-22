import { useEffect, useMemo } from "react";
import { toSafeImageBlob } from "../../utils/safeImageBlob";

export const useObjectUrl = (
	blob: Blob | null | undefined,
): string | undefined => {
	const objectUrl = useMemo(
		() => (blob ? URL.createObjectURL(toSafeImageBlob(blob)) : undefined),
		[blob],
	);

	useEffect(() => {
		if (!objectUrl) return;
		return () => {
			URL.revokeObjectURL(objectUrl);
		};
	}, [objectUrl]);

	return objectUrl;
};
