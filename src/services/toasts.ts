import { LTOAST_TYPE } from "little-shared/enums";
import { LToast } from "little-shared/types";
import {
	getChromeStorageRecords,
	setChromeStorageRecords,
} from "../utils/chrome";

const createToast = async (message: string, type: LTOAST_TYPE) => {
	const toasts = await getToasts();
	const id = toasts.map((t) => t.id).reduce((a, b) => Math.max(a, b), 0) + 1;
	toasts.push({ id, message, type });
	await setChromeStorageRecords({ toasts });
};

const getToasts = async (): Promise<Array<LToast>> => {
	const { toasts } = await getChromeStorageRecords({
		toasts: [],
	});
	return toasts;
};

const deleteToast = async (id: number): Promise<void> => {
	const toasts = await getToasts();
	const updatedToasts = toasts.filter((t) => t.id !== id);
	await setChromeStorageRecords({ toasts: updatedToasts });
};

export { createToast, getToasts, deleteToast };
