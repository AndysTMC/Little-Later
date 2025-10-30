import { useMemo, useState } from "react";

const usePagination = (itemCount: number, itemsPerBatch: number) => {
	const batchCount = useMemo(
		() => Math.max(1, Math.ceil(itemCount / itemsPerBatch)),
		[itemCount, itemsPerBatch],
	);

	const [currentBatch, setCurrentBatch] = useState(1);

	const onBatchChange = (newBatch: number) => {
		if (newBatch >= 1 && newBatch <= batchCount) {
			setCurrentBatch(newBatch);
		}
	};

	if (currentBatch > batchCount) {
		setCurrentBatch(batchCount);
	}

	const startIndex = useMemo(
		() => (currentBatch - 1) * itemsPerBatch,
		[currentBatch, itemsPerBatch],
	);

	const endIndex = useMemo(
		() => Math.min(currentBatch * itemsPerBatch, itemCount),
		[currentBatch, itemsPerBatch, itemCount],
	);

	return {
		startIndex,
		endIndex,
		batchCount,
		currentBatch,
		onBatchChange,
	};
};

export { usePagination };
