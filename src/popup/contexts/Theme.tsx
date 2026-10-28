import { LTHEME } from "little-shared/enums";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { createContext } from "react";
import { send } from "../../utils/send";
import { useCurrentUserProfile } from "../hooks/useCurrentUserProfile";
import { resolveTheme } from "../hooks/useUserProfiles";

export interface ThemeContextType {
	theme: LTHEME;
	toggleTheme: () => void;
	setTheme: (theme: LTHEME) => void;
}

const Context = createContext<ThemeContextType | undefined>(undefined);

interface ProviderProps {
	children: ReactNode;
}

const ContextProvider: React.FC<ProviderProps> = ({ children }) => {
	const userProfile = useCurrentUserProfile();
	const [theme, setTheme] = useState(
		userProfile ? resolveTheme(userProfile.theme) : LTHEME.LIGHT,
	);

	const toggleTheme = useCallback(async () => {
		if (!userProfile) return;
		const newTheme = theme === LTHEME.DARK ? LTHEME.LIGHT : LTHEME.DARK;
		await send("profile.update", {
			theme: newTheme === LTHEME.DARK ? "dark" : "light",
		});
		setTheme(newTheme);
	}, [theme, userProfile]);

	useEffect(() => {
		if (userProfile) {
			setTheme(resolveTheme(userProfile.theme));
		}
	}, [userProfile]);

	return (
		<Context.Provider
			value={{
				theme,
				toggleTheme,
				setTheme,
			}}
		>
			{children}
		</Context.Provider>
	);
};

export { Context as ThemeContext, ContextProvider as ThemeContextProvider };
