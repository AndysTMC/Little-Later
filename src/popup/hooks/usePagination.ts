import { useMemo, useState } from "react";

const usePagination = (itemCount: number, itemsPerBatch: number) => {
	const batchCount = useMemo(
		() => Math.max(1, Math.ceil(itemCount / itemsPerBatch)),
		[itemCount, itemsPerBatch],
	);

	const [currentBatch, setCurrentBatch] = useState(1);
	const safeBatch = Math.min(currentBatch, batchCount);

	const onBatchChange = (newBatch: number) => {
		if (newBatch >= 1 && newBatch <= batchCount) {
			setCurrentBatch(newBatch);
		}
	};

	const startIndex = useMemo(
		() => (safeBatch - 1) * itemsPerBatch,
		[safeBatch, itemsPerBatch],
	);

	const endIndex = useMemo(
		() => Math.min(safeBatch * itemsPerBatch, itemCount),
		[safeBatch, itemsPerBatch, itemCount],
	);

	return {
		startIndex,
		endIndex,
		batchCount,
		currentBatch: safeBatch,
		onBatchChange,
	};
};

export { usePagination };
