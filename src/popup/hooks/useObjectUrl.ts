import { useEffect, useState } from "react";

export const useObjectUrl = (
	blob: Blob | null | undefined,
): string | undefined => {
	const [objectUrl, setObjectUrl] = useState<string | undefined>();

	useEffect(() => {
		if (!blob) {
			setObjectUrl(undefined);
			return;
		}

		const nextUrl = URL.createObjectURL(blob);
		setObjectUrl(nextUrl);
		return () => {
			URL.revokeObjectURL(nextUrl);
		};
	}, [blob]);

	return objectUrl;
};
