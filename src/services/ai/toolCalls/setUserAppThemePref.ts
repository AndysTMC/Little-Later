import { LTHEME } from "little-shared/enums";
import {
	getCurrentUserProfile,
	updateUserProfile,
} from "../../../services/user";

const toolCall = async ({
	theme,
}: {
	theme: LTHEME;
}): Promise<() => Promise<void>> => {
	const currentUserProfile = await getCurrentUserProfile();
	if (!currentUserProfile) {
		throw new Error("Current user profile not found.");
	}
	if (theme !== LTHEME.LIGHT && theme !== LTHEME.DARK) {
		throw new Error("Invalid theme preference.");
	}
	if (theme === currentUserProfile.theme) {
		throw new Error("The theme is already set to " + theme);
	}
	return async () => {
		await updateUserProfile(currentUserProfile.userId, {
			theme,
		});
	};
};

export { toolCall as setUserAppThemePrefToolCall };
