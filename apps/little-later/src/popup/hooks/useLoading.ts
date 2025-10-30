import React, { useEffect, useState } from "react";

const useLoading = (deps: React.DependencyList) => {
	const [isLoading, setIsLoading] = useState(
		deps.some((dep) => dep === undefined),
	);
	useEffect(() => {
		if (deps.every((dep) => dep !== undefined)) {
			setTimeout(() => {
				setIsLoading(false);
			}, 300);
		}
	}, [deps]);

	return isLoading;
};

export { useLoading };
