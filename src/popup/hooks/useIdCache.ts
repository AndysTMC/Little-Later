import { LIdCache } from "little-shared/utils/misc";
import { useState } from "react";

const useIdCache = (ids: number[]) => {
	const [, forceUpdate] = useState(0);
	const [idCache] = useState(() => new LIdCache(ids));

	idCache.insert = (id) => {
		LIdCache.prototype.insert.call(idCache, id);
		forceUpdate((x) => x + 1);
	};
	idCache.delete = (id) => {
		LIdCache.prototype.delete.call(idCache, id);
		forceUpdate((x) => x + 1);
	};
	idCache.reset = () => {
		LIdCache.prototype.reset.call(idCache);
		forceUpdate((x) => x + 1);
	};

	return {
		currentIds: idCache.currentIds,
		idCache,
	};
};

export { useIdCache };
