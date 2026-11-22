import { LTHEME } from "little-shared/enums";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
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
import { ThemeContext, type ThemePreference } from "./ThemeContext";

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
	const preference: ThemePreference = lookOf?.theme ?? "light";
	// Until the session and profile are known, the way the popup last
	// looked.
	const [hint] = useState(readLookHint);
	const [systemTheme, setSystemTheme] = useState<LTHEME>(() =>
		resolveTheme("system"),
	);
	// Optimistic override while a theme change is being written or set directly.
	const [override, setOverride] = useState<{
		baseId: string | null;
		baseTheme: ThemePreference | null;
		theme: LTHEME;
	} | null>(null);

	const lookKeyId = lookOf?.id ?? null;
	const lookKeyTheme = lookOf?.theme ?? null;

	// With no profile unlocked the picker is light. Keeping a locked
	// profile's dark theme drew white icons on its white page, so a profile
	// without a photo showed nothing above its name. An unlock screen shows
	// its own profile's theme, page and all.
	const theme: LTHEME = !isResolved
		? hint.theme
		: override &&
			  override.baseId === lookKeyId &&
			  override.baseTheme === lookKeyTheme
			? override.theme
			: !lookOf
				? LTHEME.LIGHT
				: lookOf.theme === "system"
					? systemTheme
					: resolveTheme(lookOf.theme);

	const setTheme = useCallback(
		(next: LTHEME) => {
			setOverride({
				baseId: lookKeyId,
				baseTheme: lookKeyTheme,
				theme: next,
			});
		},
		[lookKeyId, lookKeyTheme],
	);

	// The profile picker uses the plain look: it shows several profiles.
	const accent: Accent = isResolved
		? (lookOf?.accent ?? DEFAULT_LOOK.accent)
		: hint.accent;
	// A colour being dialled, ahead of the profile's row.
	const [draftColor, setDraftColor] = useState<{
		profileId: string;
		color: string;
	} | null>(null);
	const activeDraftColor =
		userProfile && draftColor?.profileId === userProfile.id
			? draftColor.color
			: null;
	const accentColor =
		activeDraftColor ??
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
	const pendingColor = useRef<{ profileId: string; color: string } | null>(
		null,
	);
	const saveColor = useCallback(() => {
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = null;
		const pending = pendingColor.current;
		pendingColor.current = null;
		if (pending === null) return;
		void attempt(
			() =>
				send(
					"profile.update",
					{ accentColor: pending.color },
					{ profileId: pending.profileId },
				),
			"Couldn't change how Little Later looks.",
		).then(() => {
			// A newer colour may be on its way; it clears the draft then.
			if (pendingColor.current === null) setDraftColor(null);
		});
	}, []);
	const setAccentColor = useCallback(
		(next: string) => {
			if (!userProfile) return;
			setDraftColor({ profileId: userProfile.id, color: next });
			pendingColor.current = { profileId: userProfile.id, color: next };
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(saveColor, COLOR_SAVE_DELAY_MS);
		},
		[userProfile, saveColor],
	);

	// Cancel unsaved colour edits if the profile locks or changes.
	const currentProfileId = userProfile?.id ?? null;
	useEffect(() => {
		if (
			pendingColor.current &&
			pendingColor.current.profileId !== currentProfileId
		) {
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = null;
			pendingColor.current = null;
		}
	}, [currentProfileId]);

	// A colour still waiting is saved when the provider goes, not dropped.
	useEffect(() => saveColor, [saveColor]);

	const setPreference = useCallback(
		async (next: ThemePreference) => {
			if (!userProfile) return;
			// Shown at once; the profile's row follows. If it cannot be
			// stored, the screen goes back to what the profile still says.
			setOverride({
				baseId: userProfile.id,
				baseTheme: userProfile.theme,
				theme: resolveTheme(next),
			});
			const stored = await attempt(
				() => send("profile.update", { theme: next }),
				"Couldn't change the theme.",
			);
			if (!stored) {
				setOverride(null);
			}
		},
		[userProfile],
	);

	const toggleTheme = useCallback(
		() => setPreference(theme === LTHEME.DARK ? "light" : "dark"),
		[theme, setPreference],
	);

	useEffect(() => {
		const look = { theme, accent, accentColor };
		paintRoot(look);
		writeLookHint(look);
	}, [theme, accent, accentColor]);

	// A "system" preference follows the device when it changes.
	useEffect(() => {
		if (
			!lookOf ||
			lookOf.theme !== "system" ||
			typeof matchMedia !== "function"
		) {
			return;
		}
		const query = matchMedia(DARK_SCHEME);
		const follow = () => setSystemTheme(resolveTheme("system"));
		query.addEventListener("change", follow);
		return () => query.removeEventListener("change", follow);
	}, [lookOf]);

	return (
		<ThemeContext.Provider
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
		</ThemeContext.Provider>
	);
};

export { ContextProvider as ThemeContextProvider };
