import { LTHEME } from "little-shared/enums";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createContext } from "react";
import { send } from "../../utils/send";
import { attempt } from "../attempt";
import { useResolvedCurrentUser } from "../hooks/useCurrentUserProfile";
import {
	DEFAULT_LOOK,
	paintRoot,
	readLookHint,
	writeLookHint,
} from "../themeHint";
import { DEFAULT_CUSTOM_COLOR, type Accent } from "../../appearance";
import { resolveTheme, type UserProfile } from "../hooks/useUserProfiles";

export type ThemePreference = UserProfile["theme"];

export interface ThemeContextType {
	// The theme in use: the preference, with "system" resolved.
	theme: LTHEME;
	// What the profile asks for: system, light or dark.
	preference: ThemePreference;
	toggleTheme: () => void;
	setTheme: (theme: LTHEME) => void;
	setPreference: (preference: ThemePreference) => void;
	// The colour the popup is drawn in (src/appearance.ts).
	accent: Accent;
	setAccent: (accent: Accent) => void;
	// The Custom accent's colour. Setting it shows it at once and stores
	// it a moment later, so dragging a dial is one write, not hundreds.
	accentColor: string;
	setAccentColor: (color: string) => void;
	// Shows a locked profile's look while its unlock screen is open (null
	// to stop): its theme and accent are plain, like its name and photo.
	showLookOf: (profile: UserProfile | null) => void;
}

const Context = createContext<ThemeContextType | undefined>(undefined);

interface ProviderProps {
	children: ReactNode;
}

const DARK_SCHEME = "(prefers-color-scheme: dark)";
// How long the Custom colour waits for the dials to settle before saving.
const COLOR_SAVE_DELAY_MS = 400;

const ContextProvider: React.FC<ProviderProps> = ({ children }) => {
	const { isResolved, profile: userProfile } = useResolvedCurrentUser();
	// The unlock screen's profile, while no profile is unlocked.
	const [shown, setShown] = useState<UserProfile | null>(null);
	const lookOf = userProfile ?? shown;
	const preference: ThemePreference = userProfile?.theme ?? "system";
	// Until the session and profile are known, the way the popup last
	// looked.
	const [hint] = useState(readLookHint);
	const [theme, setTheme] = useState(() =>
		userProfile ? resolveTheme(userProfile.theme) : hint.theme,
	);
	// The profile picker uses the plain look: it shows several profiles.
	const accent: Accent = isResolved
		? (lookOf?.accent ?? DEFAULT_LOOK.accent)
		: hint.accent;
	// A colour being dialled, ahead of the profile's row.
	const [draftColor, setDraftColor] = useState<string | null>(null);
	const accentColor =
		draftColor ??
		(isResolved ? lookOf?.accentColor : hint.accentColor) ??
		DEFAULT_CUSTOM_COLOR;

	const setAccent = useCallback(
		(next: Accent) => {
			if (!userProfile) return;
			// The profile's row brings it to the screen.
			void attempt(
				() => send("profile.update", { accent: next }),
				"Couldn't change how Little Later looks.",
			);
		},
		[userProfile],
	);

	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingColor = useRef<string | null>(null);
	const saveColor = useCallback(() => {
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = null;
		const color = pendingColor.current;
		pendingColor.current = null;
		if (color === null) return;
		void attempt(
			() => send("profile.update", { accentColor: color }),
			"Couldn't change how Little Later looks.",
		).then(() => {
			// A newer colour may be on its way; it clears the draft then.
			if (pendingColor.current === null) setDraftColor(null);
		});
	}, []);
	const setAccentColor = useCallback(
		(next: string) => {
			if (!userProfile) return;
			setDraftColor(next);
			pendingColor.current = next;
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(saveColor, COLOR_SAVE_DELAY_MS);
		},
		[userProfile, saveColor],
	);
	// A colour still waiting is saved when the provider goes, not dropped.
	useEffect(() => saveColor, [saveColor]);

	const setPreference = useCallback(
		async (next: ThemePreference) => {
			if (!userProfile) return;
			// Shown at once; the profile's row follows. If it cannot be
			// stored, the screen goes back to what the profile still says.
			setTheme(resolveTheme(next));
			const stored = await attempt(
				() => send("profile.update", { theme: next }),
				"Couldn't change the theme.",
			);
			if (!stored) {
				setTheme(resolveTheme(userProfile.theme));
			}
		},
		[userProfile],
	);

	const toggleTheme = useCallback(
		() => setPreference(theme === LTHEME.DARK ? "light" : "dark"),
		[theme, setPreference],
	);

	// With no profile unlocked the picker is light. Keeping a locked
	// profile's dark theme drew white icons on its white page, so a profile
	// without a photo showed nothing above its name. An unlock screen shows
	// its own profile's theme, page and all.
	useEffect(() => {
		if (!isResolved) return;
		setTheme(lookOf ? resolveTheme(lookOf.theme) : LTHEME.LIGHT);
	}, [isResolved, lookOf]);

	useEffect(() => {
		const look = { theme, accent, accentColor };
		paintRoot(look);
		writeLookHint(look);
	}, [theme, accent, accentColor]);

	// A "system" preference follows the device when it changes.
	useEffect(() => {
		if (preference !== "system" || typeof matchMedia !== "function") {
			return;
		}
		const query = matchMedia(DARK_SCHEME);
		const follow = () => setTheme(resolveTheme("system"));
		query.addEventListener("change", follow);
		return () => query.removeEventListener("change", follow);
	}, [preference]);

	return (
		<Context.Provider
			value={{
				theme,
				preference,
				toggleTheme,
				setTheme,
				setPreference,
				accent,
				setAccent,
				accentColor,
				setAccentColor,
				showLookOf: setShown,
			}}
		>
			{children}
		</Context.Provider>
	);
};

export { Context as ThemeContext, ContextProvider as ThemeContextProvider };
