import { createContext, useState } from "react";
import { ContextProviderProps, LittleNavigation } from "../../types";
import { LLOWER_HOME_NAV_ROUTES } from "little-shared/enums";
import { useLittleNavigation } from "../hooks/useLittleNavigation";

interface ContextProps {
	activeRoute: LLOWER_HOME_NAV_ROUTES;
	setActiveRoute: (route: LLOWER_HOME_NAV_ROUTES) => void;
	homeNavigation: LittleNavigation;
	setHomeNavigation: (navigation: LittleNavigation) => void;
	homeSubNavigation: LittleNavigation;
	setHomeSubNavigation: (navigation: LittleNavigation) => void;
	shouldHomeNavigate: boolean;
	setShouldHomeNavigate: (shouldNavigate: boolean) => void;
	shouldHomeSubNavigate: boolean;
	setShouldHomeSubNavigate: (shouldNavigate: boolean) => void;
}

const Context = createContext<ContextProps>({
	activeRoute: LLOWER_HOME_NAV_ROUTES.SELF,
	setActiveRoute: () => {},
	homeNavigation: {
		exit: {},
		navigateTo: "",
		navigateOptions: {},
	},
	setHomeNavigation: () => {},
	homeSubNavigation: {
		exit: {},
		navigateTo: "",
		navigateOptions: {},
	},
	setHomeSubNavigation: () => {},
	shouldHomeNavigate: false,
	setShouldHomeNavigate: () => {},
	shouldHomeSubNavigate: false,
	setShouldHomeSubNavigate: () => {},
});

const ContextProvider: React.FC<ContextProviderProps> = ({ children }) => {
	const [activeRoute, setActiveRoute] = useState<LLOWER_HOME_NAV_ROUTES>(
		LLOWER_HOME_NAV_ROUTES.SELF,
	);

	const {
		littleNavigation: homeNavigation,
		setLittleNavigation: setHomeNavigation,
	} = useLittleNavigation();

	const {
		littleNavigation: homeSubNavigation,
		setLittleNavigation: setHomeSubNavigation,
	} = useLittleNavigation();

	const [shouldHomeNavigate, setShouldHomeNavigate] = useState(false);

	const [shouldHomeSubNavigate, setShouldHomeSubNavigate] = useState(false);

	return (
		<Context.Provider
			value={{
				activeRoute,
				setActiveRoute,
				homeNavigation,
				setHomeNavigation,
				homeSubNavigation,
				setHomeSubNavigation,
				shouldHomeNavigate,
				setShouldHomeNavigate,
				shouldHomeSubNavigate,
				setShouldHomeSubNavigate,
			}}
		>
			{children}
		</Context.Provider>
	);
};

export { Context as HomeContext, ContextProvider as HomeContextProvider };
