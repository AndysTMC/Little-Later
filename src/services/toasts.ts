import { LTOAST_TYPE } from "little-shared/enums";
import { LToast } from "little-shared/types";
import {
	getChromeStorageRecords,
	setChromeStorageRecords,
} from "../utils/chrome";

// Each change reads the list and writes it back, so two at once lost one
// of them. Only pages make toasts; within a page they go one at a time.
let pending: Promise<unknown> = Promise.resolve();
const oneAtATime = <T>(change: () => Promise<T>): Promise<T> => {
	const next = pending.then(change);
	pending = next.catch(() => undefined);
	return next;
};

const createToast = (message: string, type: LTOAST_TYPE): Promise<void> =>
	oneAtATime(async () => {
		const toasts = await getToasts();
		const id =
			toasts.map((t) => t.id).reduce((a, b) => Math.max(a, b), 0) + 1;
		toasts.push({ id, message, type });
		await setChromeStorageRecords({ toasts });
	});

const getToasts = async (): Promise<Array<LToast>> => {
	const { toasts } = await getChromeStorageRecords({
		toasts: [],
	});
	return toasts;
};

const deleteToast = (id: number): Promise<void> =>
	oneAtATime(async () => {
		const toasts = await getToasts();
		await setChromeStorageRecords({
			toasts: toasts.filter((t) => t.id !== id),
		});
	});

export { createToast, getToasts, deleteToast };
