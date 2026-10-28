import { useLiveQuery } from "dexie-react-hooks";
import { LTHEME } from "little-shared/enums";
import { littleDB } from "../../storage/pageDB";
import type { ProfileRow } from "../../storage/schema";

// What the popup shows of a profile; all of it is plain (0010).
export type UserProfile = {
	id: string;
	name: string;
	hasPassword: boolean;
	theme: "system" | "light" | "dark";
	autoLockMinutes: number;
};

export const toUserProfile = (row: ProfileRow): UserProfile => ({
	id: row.id,
	name: row.name,
	hasPassword: row.protection === "password",
	theme:
		row.prefs.theme === "light" || row.prefs.theme === "dark"
			? row.prefs.theme
			: "system",
	autoLockMinutes: row.prefs.autoLockMinutes,
});

// "system" follows the device's colour scheme.
export const resolveTheme = (theme: UserProfile["theme"]): LTHEME => {
	if (theme === "system") {
		return typeof matchMedia === "function" &&
			matchMedia("(prefers-color-scheme: dark)").matches
			? LTHEME.DARK
			: LTHEME.LIGHT;
	}
	return theme === "dark" ? LTHEME.DARK : LTHEME.LIGHT;
};

const useUserProfiles = (): Array<UserProfile> | undefined =>
	useLiveQuery(
		async () =>
			(await littleDB.profiles.orderBy("id").toArray())
				.map(toUserProfile)
				.sort((a, b) => a.name.localeCompare(b.name)),
		[],
		undefined,
	);

export { useUserProfiles };
