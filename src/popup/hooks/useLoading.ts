import { useState } from "react";

// True until every dependency has a value. Once a page has loaded it stays
// loaded: a value that is briefly missing while it refreshes must not swap
// the page for the loading screen and drop what the user was doing.
const useLoading = (deps: ReadonlyArray<unknown>) => {
	const [hasLoaded, setHasLoaded] = useState(false);
	const isReady = deps.every((dep) => dep !== undefined);
	if (isReady && !hasLoaded) {
		setHasLoaded(true);
	}
	return !(hasLoaded || isReady);
};

export { useLoading };
