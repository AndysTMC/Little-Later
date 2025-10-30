import { LLINK_TYPE } from "little-shared/enums";
import { createLink } from "../../../services/link";
import { createNote } from "../../../services/note";
import { saveActiveWebPage } from "../../../services/visualBM";

const toolCall = async (content: string): Promise<() => Promise<void>> => {
	return async () => {
		const vbmId = await saveActiveWebPage();
		const noteId = await createNote({
			content,
		});
		await createLink({
			noteId,
			type: LLINK_TYPE.NOTE_VBM,
			vbmId,
		});
	};
};

export { toolCall as createNoteOnActiveWebpageToolCall };
