import { LLINK_TYPE } from "little-shared/enums";
import { createLink } from "../../../services/link";
import { getNote } from "../../../services/note";
import { saveActiveWebPage } from "../../../services/visualBM";

const toolCall = async (id: number): Promise<() => Promise<void>> => {
	const note = getNote(id);
	if (note === undefined) {
		throw new Error("Note not found");
	}
	return async () => {
		const vbmId = await saveActiveWebPage();
		await createLink({
			noteId: id,
			type: LLINK_TYPE.NOTE_VBM,
			vbmId,
		});
	};
};

export { toolCall as linkNoteToActiveWebpageToolCall };
