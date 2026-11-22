import {
	DEFAULT_ACCENT,
	isAccent,
	isAccentColor,
	type Accent,
} from "../../appearance";
import { useLiveQuery } from "dexie-react-hooks";
import { LTHEME } from "little-shared/enums";
import { littleDB } from "../../storage/pageDB";
import type { ProfileRow } from "../../storage/schema";
import { toBase64 } from "../../storage/session";

// What the popup shows of a profile; all of it is plain (0010).
export type UserProfile = {
	id: string;
	name: string;
	hasPassword: boolean;
	theme: "system" | "light" | "dark";
	autoLockMinutes: number;
	accent: Accent;
	// The Custom accent's colour, once one was chosen.
	accentColor: string | null;
	// The authenticators that unlock it with the password, while
	// two-factor unlock is on (decision 0015); plain, like the name.
	authenticators: Array<ProfileAuthenticator> | null;
};

export type ProfileAuthenticator = {
	// base64, as commands take it.
	credentialId: string;
	prfSalt: string;
	name: string;
	addedAt: number;
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
	accent: isAccent(row.prefs.accent) ? row.prefs.accent : DEFAULT_ACCENT,
	accentColor: isAccentColor(row.prefs.accentColor)
		? row.prefs.accentColor
		: null,
	authenticators: row.secondFactor
		? row.secondFactor.authenticators.map((entry) => ({
				credentialId: toBase64(entry.credentialId),
				prfSalt: toBase64(entry.prfSalt),
				name: entry.name,
				addedAt: entry.addedAt,
			}))
		: null,
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
