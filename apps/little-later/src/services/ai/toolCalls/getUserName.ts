import { getCurrentUserProfile } from "../../../services/user";

const toolCall = async () => {
	const currentUserProfile = await getCurrentUserProfile();
	if (!currentUserProfile) {
		throw new Error("Current user profile not found.");
	}
	return currentUserProfile.name;
};

export { toolCall as getUserNameToolCall };
