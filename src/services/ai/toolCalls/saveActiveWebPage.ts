import { saveActiveWebPage } from "../../../services/visualBM";

const toolCall = async (): Promise<() => Promise<void>> => {
	return async () => {
		const id = await saveActiveWebPage();
		if (id < 0) {
			throw new Error("Could not save the active page.");
		}
	};
};

export { toolCall as saveActiveWebPageToolCall };
