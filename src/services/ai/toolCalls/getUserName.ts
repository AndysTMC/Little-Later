import { readProfile } from "../records";
import type { AIOwner } from "../owner";

const toolCall = async (owner: AIOwner) =>
	(await readProfile(await owner.keys())).name;

export { toolCall as getUserNameToolCall };
