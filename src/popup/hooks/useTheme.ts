import { useContext } from "react";
import { ThemeContext, ThemeContextType } from "../contexts/ThemeContext";

/** Returns the active theme, accent palette, and theme mutators from `ThemeContext`. */
const useTheme = (): ThemeContextType => {
	const context = useContext<ThemeContextType | undefined>(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeContextProvider");
	}
	return context;
};

export { useTheme };
