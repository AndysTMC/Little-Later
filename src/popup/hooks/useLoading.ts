import { useEffect, useState } from "react";

const useLoading = (deps: ReadonlyArray<unknown>) => {
	const isReady = deps.every((dep) => dep !== undefined);
	const [isLoading, setIsLoading] = useState(!isReady);
	useEffect(() => {
		if (!isReady) {
			setIsLoading(true);
			return;
		}
		const timeout = window.setTimeout(() => {
			setIsLoading(false);
		}, 300);
		return () => {
			window.clearTimeout(timeout);
		};
	}, [isReady]);

	return isLoading;
};

export { useLoading };
