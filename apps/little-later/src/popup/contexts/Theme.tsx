import { LTHEME } from "little-shared/enums";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { createContext } from "react";
import { updateUserProfile } from "../../services/user";
import { useCurrentUserProfile } from "../hooks/useCurrentUserProfile";

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
		userProfile ? userProfile.theme : LTHEME.LIGHT,
	);

	const toggleTheme = useCallback(async () => {
		if (!userProfile) return;
		const newTheme = theme === LTHEME.DARK ? LTHEME.LIGHT : LTHEME.DARK;
		updateUserProfile(userProfile.userId, { theme: newTheme }).then(() => {
			setTheme(newTheme);
		});
	}, [theme, userProfile]);

	useEffect(() => {
		if (userProfile) {
			setTheme(userProfile.theme);
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
