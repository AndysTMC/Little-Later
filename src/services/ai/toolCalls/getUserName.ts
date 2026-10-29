import { readProfile, unlockedKeys } from "../records";

const toolCall = async () => (await readProfile(await unlockedKeys())).name;

export { toolCall as getUserNameToolCall };
