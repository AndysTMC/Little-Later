import { saveActiveWebPage } from "../../../services/visualBM";

const toolCall = async (): Promise<() => Promise<void>> => {
	return async () => {
		await saveActiveWebPage();
	};
};

export { toolCall as saveActiveWebPageToolCall };
