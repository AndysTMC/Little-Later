import { useEffect, useState } from "react";
import { toSafeImageBlob } from "../../utils/safeImageBlob";

export const useObjectUrl = (
	blob: Blob | null | undefined,
): string | undefined => {
	const [objectUrl, setObjectUrl] = useState<string | undefined>();

	useEffect(() => {
		if (!blob) {
			setObjectUrl(undefined);
			return;
		}

		const nextUrl = URL.createObjectURL(toSafeImageBlob(blob));
		setObjectUrl(nextUrl);
		return () => {
			URL.revokeObjectURL(nextUrl);
		};
	}, [blob]);

	return objectUrl;
};
