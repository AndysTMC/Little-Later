import { useEffect } from "react";
import {
	Routes,
	Route,
	HashRouter,
	useLocation,
	useNavigate,
} from "react-router";
import { AnimatePresence } from "framer-motion";
import "./App.css";
import { useTheme } from "./hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { ThemeContextProvider } from "./contexts/Theme";
import { HomeContextProvider } from "./contexts/Home";
import { LUIIntro } from "./pages/LUIIntro/Page";
import { LUIGettingStarted } from "./pages/LUIGettingStarted/Page";
import { LUIProfileMenu } from "./pages/LUIProfileMenu/Page";
import { LUIProfileCreator } from "./pages/LUIProfileCreator/Page";
import { LUIUnlock } from "./pages/LUIUnlock/Page";
import { LUIHome } from "./pages/LUIHome/Page";
import { LUIHomeMain } from "./components/LUIHomeMain/Component";
import { LUIHistory } from "./components/LUIHistory/Component";
import { LUITaskCreator } from "./components/LUITaskCreator/Component";
import { LUIReminderCreator } from "./components/LUIReminderCreator/Component";
import { LUIAIAssist } from "./pages/LUIAIAssist/Page";
import { LUIProfile } from "./pages/LUIProfile/Page";
import { LUISettings } from "./pages/LUISettings/Page";
import { LUIAISettings } from "./pages/LUIAISettings/Page";
import { LUIExport } from "./pages/LUIExport/Page";
import { LUILock } from "./pages/LUILock/Page";
import { LUIVBM } from "./pages/LUIVBM/Page";
import { LUITask } from "./pages/LUITask/Page";
import { LUIReminder } from "./pages/LUIReminder/Page";
import { LUINote } from "./pages/LUINote/Page";
import { LUIToasts } from "./components/LUIToasts/Component";
import { LUIMiscSettings } from "./pages/LUIMiscSettings/Page";

function AnimatedRoutes() {
	const location = useLocation();
	const navigate = useNavigate();
	const { theme, toggleTheme } = useTheme();

	useEffect(() => {
		const handleBeforeUnload = () => {
			navigate(location.pathname, { replace: true, state: {} });
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [location, navigate]);

	useEffect(() => {
		const rootElement = document.getElementById("root");
		if (theme === LTHEME.DARK) {
			rootElement?.classList.add("bg-black");
			rootElement?.classList.remove("bg-white");
		} else {
			rootElement?.classList.add("bg-white");
			rootElement?.classList.remove("bg-black");
		}
	}, [theme, toggleTheme]);

	return (
		<AnimatePresence mode="wait">
			<Routes location={location} key={location.pathname}>
				<Route path="/" element={<LUIIntro />} />
				<Route
					path="/getting-started"
					element={<LUIGettingStarted />}
				/>
				<Route path="/browse-profiles" element={<LUIProfileMenu />} />
				<Route path="/new-profile" element={<LUIProfileCreator />} />
				<Route path="/unlock/:id" element={<LUIUnlock />} />
				<Route path="/home" element={<LUIHome />}>
					<Route index element={<LUIHomeMain />} />
					<Route path="history" element={<LUIHistory />} />
					<Route path="new-task" element={<LUITaskCreator />} />
					<Route
						path="new-reminder"
						element={<LUIReminderCreator />}
					/>
				</Route>
				<Route path="/ai" element={<LUIAIAssist />} />
				<Route path="/profile" element={<LUIProfile />} />
				<Route path="/settings" element={<LUISettings />} />
				<Route path="/settings/ai" element={<LUIAISettings />} />
				<Route path="/settings/misc" element={<LUIMiscSettings />} />
				<Route path="/export" element={<LUIExport />} />
				<Route path="/lock" element={<LUILock />} />
				<Route path="/vbm/:id" element={<LUIVBM />} />
				<Route path="/task/:id" element={<LUITask />} />
				<Route path="/reminder/:id" element={<LUIReminder />} />
				<Route path="/note/:id" element={<LUINote />} />
			</Routes>
		</AnimatePresence>
	);
}

function App() {
	return (
		<HashRouter>
			<ThemeContextProvider>
				<HomeContextProvider>
					<AnimatedRoutes />
					<LUIToasts />
				</HomeContextProvider>
			</ThemeContextProvider>
		</HashRouter>
	);
}

export default App;

