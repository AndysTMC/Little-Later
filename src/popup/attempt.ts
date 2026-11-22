import { LTOAST_TYPE } from "little-shared/enums";
import { createToast } from "../services/toasts";

// Runs a write and tells the user if it fails. Card and list actions have
// no place of their own for an error, so without this a refused command
// (a locked profile, a record that is gone) failed without a word.
export const attempt = async (
	action: () => Promise<unknown> | void,
	fallbackMessage = "That didn't work. Try again.",
): Promise<boolean> => {
	try {
		await action();
		return true;
	} catch (error) {
		console.error(fallbackMessage, error);
		await createToast(
			error instanceof Error && error.message !== ""
				? error.message
				: fallbackMessage,
			LTOAST_TYPE.ERROR,
		);
		return false;
	}
};
