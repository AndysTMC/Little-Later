import { LTHEME } from "little-shared/enums";
import { createContext } from "react";
import type { Accent } from "../../appearance";
import type { UserProfile } from "../hooks/useUserProfiles";

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

export const ThemeContext = createContext<ThemeContextType | undefined>(
	undefined,
);
