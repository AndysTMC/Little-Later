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
import { LUINotes } from "./pages/LUINotes/Page";
import { LUIAIAssist } from "./pages/LUIAIAssist/Page";
import { LUIProfile } from "./pages/LUIProfile/Page";
import { LUISettings } from "./pages/LUISettings/Page";
import { LUIAISettings } from "./pages/LUIAISettings/Page";
import { LUIExport } from "./pages/LUIExport/Page";
import { LUILock } from "./pages/LUILock/Page";
import { LUISave } from "./pages/LUISave/Page";
import { LUITask } from "./pages/LUITask/Page";
import { LUIReminder } from "./pages/LUIReminder/Page";
import { LUISwitch } from "./pages/LUISwitch/Page";
import { LocalSocketContextProvider } from "./contexts/LocalSocket";
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

	// useEffect(() => {
	// 	db.visualBMTbl.bulkPut([
	// 		{
	// 			title: "Vite | Next Generation Frontend Tooling",
	// 			url: "https://vite.dev/",
	// 			customName: "Vite | Next Generation Frontend Tooling",
	// 			hasBrowsed: 1,
	// 			lastBrowseDate: "2025-07-17T01:05:21+05:30",
	// 			isSaved: 0,
	// 			id: 2,
	// 		},
	// 		{
	// 			title: "Google Gemini",
	// 			url: "https://gemini.google.com/app",
	// 			customName: "Google Gemini",
	// 			hasBrowsed: 1,
	// 			lastBrowseDate: "2025-07-17T01:05:22+05:30",
	// 			isSaved: 0,
	// 			id: 4,
	// 		},
	// 		{
	// 			title: "Home • Angular",
	// 			url: "https://angular.dev/",
	// 			customName: "Home • Angular",
	// 			hasBrowsed: 1,
	// 			lastBrowseDate: "2025-07-17T01:05:19+05:30",
	// 			isSaved: 0,
	// 			id: 5,
	// 		},
	// 		{
	// 			title: "TanStack Virtual",
	// 			url: "https://tanstack.com/virtual/latest",
	// 			customName: "TanStack Virtual",
	// 			hasBrowsed: 1,
	// 			lastBrowseDate: "2025-07-17T01:05:29+05:30",
	// 			isSaved: 0,
	// 			id: 39,
	// 		},
	// 		{
	// 			title: "Rest In Pease",
	// 			url: "https://rest.in.pease.com/virtual/latest",
	// 			customName: "Rest In Peace",
	// 			hasBrowsed: 1,
	// 			lastBrowseDate: "2025-08-17T01:05:29+05:30",
	// 			isSaved: 0,
	// 			id: 40,
	// 		},
	// 	]);
	// });

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
				<Route path="/switch-storage/" element={<LUISwitch />} />
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
				<Route path="/notebook" element={<LUINotes />} />
				<Route path="/ai" element={<LUIAIAssist />} />
				<Route path="/profile" element={<LUIProfile />} />
				<Route path="/settings" element={<LUISettings />} />
				<Route path="/settings/ai" element={<LUIAISettings />} />
				<Route path="/settings/misc" element={<LUIMiscSettings />} />
				<Route path="/export" element={<LUIExport />} />
				<Route path="/lock" element={<LUILock />} />
				<Route path="/save/:id" element={<LUISave />} />
				<Route path="/task/:id" element={<LUITask />} />
				<Route path="/reminder/:id" element={<LUIReminder />} />
			</Routes>
		</AnimatePresence>
	);
}

function App() {
	return (
		<HashRouter>
			<LocalSocketContextProvider>
				<ThemeContextProvider>
					<HomeContextProvider>
						<AnimatedRoutes />
						<LUIToasts />
					</HomeContextProvider>
				</ThemeContextProvider>
			</LocalSocketContextProvider>
		</HashRouter>
	);
}

export default App;
