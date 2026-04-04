import { useContext } from "react";
import { ThemeContext, ThemeContextType } from "../contexts/Theme";

const useTheme = (): ThemeContextType => {
	const context = useContext<ThemeContextType | undefined>(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeContextProvider");
	}
	return context;
};

export { useTheme };
