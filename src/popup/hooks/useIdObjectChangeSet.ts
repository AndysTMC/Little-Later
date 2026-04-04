import { LIdObjectChangeSet } from "little-shared/utils/misc";
import { useState } from "react";

const useIdObjectChangeSet = <T extends { id: number }>(
	idObjects: Array<T>,
) => {
	const [, forceUpdate] = useState(0);
	const [idObjectCS] = useState(() => new LIdObjectChangeSet<T>(idObjects));

	idObjectCS.insert = (idObject: T) => {
		LIdObjectChangeSet.prototype.insert.call(idObjectCS, idObject);
		forceUpdate((x) => x + 1);
	};

	idObjectCS.update = (idObject: T) => {
		LIdObjectChangeSet.prototype.update.call(idObjectCS, idObject);
		forceUpdate((x) => x + 1);
	};

	idObjectCS.delete = (idObject: T) => {
		LIdObjectChangeSet.prototype.delete.call(idObjectCS, idObject);
		forceUpdate((x) => x + 1);
	};

	idObjectCS.reset = () => {
		LIdObjectChangeSet.prototype.reset.call(idObjectCS);
		forceUpdate((x) => x + 1);
	};

	return {
		currentObjects: idObjectCS.currentObjects,
		idObjectCS,
	};
};

export { useIdObjectChangeSet };
