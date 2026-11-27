import { useEffect } from "react";
import {
	Navigate,
	Routes,
	Route,
	HashRouter,
	useLocation,
	useNavigate,
} from "react-router";
import { AnimatePresence, MotionConfig } from "framer-motion";
import "./App.css";
import { ThemeContextProvider } from "./contexts/Theme";
import { RecordsProvider } from "./contexts/Records";
import { UIStateProvider } from "./contexts/UIState";
import { LUIErrorBoundary } from "./components/LUIErrorBoundary/Component";
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
import { LUINoteCreator } from "./components/LUINoteCreator/Component";
import { LUIProfile } from "./pages/LUIProfile/Page";
import { LUISettings } from "./pages/LUISettings/Page";
import { LUIAISettings } from "./pages/LUIAISettings/Page";
import { LUIAIProviderSettings } from "./pages/LUIAIProviderSettings/Page";
import { LUIAIBehaviorSettings } from "./pages/LUIAIBehaviorSettings/Page";
import { LUIAIMemoriesSettings } from "./pages/LUIAIMemoriesSettings/Page";
import { LUIAIMcpSettings } from "./pages/LUIAIMcpSettings/Page";
import { LUIExport } from "./pages/LUIExport/Page";
import { LUILock } from "./pages/LUILock/Page";
import { LUIVBM } from "./pages/LUIVBM/Page";
import { LUITask } from "./pages/LUITask/Page";
import { LUIReminder } from "./pages/LUIReminder/Page";
import { LUINote } from "./pages/LUINote/Page";
import { LUIImage } from "./pages/LUIImage/Page";
import { LUIToasts } from "./components/LUIToasts/Component";
import { LUIMiscSettings } from "./pages/LUIMiscSettings/Page";
import { LUISecuritySettings } from "./pages/LUISecuritySettings/Page";
import { LUIDataPrivacySettings } from "./pages/LUIDataPrivacySettings/Page";
import { LUIPasswordSettings } from "./pages/LUIPasswordSettings/Page";
import { LUITwoFactorSettings } from "./pages/LUITwoFactorSettings/Page";
import { LUITwoFactorAction } from "./pages/LUITwoFactorAction/Page";
import { LUIAppearanceSettings } from "./pages/LUIAppearanceSettings/Page";
import { LUIFileInput } from "./pages/LUIFileInput/Page";
import { LUIImportProfile } from "./pages/LUIImportProfile/Page";
import { LUISavePreview } from "./pages/LUISavePreview/Page";
import { LUIAI } from "./pages/LUIAI/Page";
import { useResolvedCurrentUser } from "./hooks/useCurrentUserProfile";
import { readMove } from "../route-transitions";
import { useMoveNavigate } from "./hooks/usePageMove";

const requiresUnlockedProfile = (pathname: string): boolean =>
	pathname === "/home" ||
	pathname.startsWith("/home/") ||
	pathname === "/ai" ||
	pathname === "/profile" ||
	pathname.startsWith("/settings") ||
	pathname === "/export" ||
	pathname === "/lock" ||
	pathname.startsWith("/vbm/") ||
	pathname.startsWith("/preview/") ||
	pathname.startsWith("/task/") ||
	pathname.startsWith("/reminder/") ||
	pathname.startsWith("/note/") ||
	pathname.startsWith("/image/");

// A page that needs an unlocked profile goes to the profile picker as soon
// as no profile is unlocked: locking, auto-lock, deleting the profile. That
// is leaving the profile, so it zooms out like the Lock button does.
function SessionRedirect() {
	const location = useLocation();
	const go = useMoveNavigate();
	const { isResolved, profile } = useResolvedCurrentUser();

	useEffect(() => {
		if (!isResolved || profile) {
			return;
		}
		if (requiresUnlockedProfile(location.pathname)) {
			go("/browse-profiles", "outOf", { replace: true });
		}
	}, [isResolved, profile, location.pathname, go]);

	return null;
}

// Home and its panels are one page; Home animates its panels itself.
const pageKey = (pathname: string): string =>
	pathname === "/home" || pathname.startsWith("/home/") ? "/home" : pathname;

function AnimatedRoutes() {
	const location = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		const handleBeforeUnload = () => {
			navigate(location.pathname + location.search, {
				replace: true,
				state: {},
			});
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [location, navigate]);

	return (
		// The navigation's move also animates the page being left.
		<AnimatePresence mode="wait" custom={readMove(location.state)}>
			<Routes location={location} key={pageKey(location.pathname)}>
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
					<Route path="new-note" element={<LUINoteCreator />} />
				</Route>
				<Route path="/profile" element={<LUIProfile />} />
				<Route path="/settings" element={<LUISettings />} />
				<Route path="/settings/ai" element={<LUIAISettings />} />
				<Route
					path="/settings/ai/provider"
					element={<LUIAIProviderSettings />}
				/>
				<Route
					path="/settings/ai/behavior"
					element={<LUIAIBehaviorSettings />}
				/>
				<Route
					path="/settings/ai/memories"
					element={<LUIAIMemoriesSettings />}
				/>
				<Route path="/settings/ai/mcp" element={<LUIAIMcpSettings />} />
				<Route path="/settings/misc" element={<LUIMiscSettings />} />
				<Route
					path="/settings/security"
					element={<LUISecuritySettings />}
				/>
				<Route
					path="/settings/privacy"
					element={<LUIDataPrivacySettings />}
				/>
				<Route
					path="/settings/security/password"
					element={<LUIPasswordSettings />}
				/>
				<Route
					path="/settings/security/two-factor"
					element={<LUITwoFactorSettings />}
				/>
				<Route
					path="/settings/security/two-factor/:action/:credential?"
					element={<LUITwoFactorAction />}
				/>
				<Route
					path="/settings/appearance"
					element={<LUIAppearanceSettings />}
				/>
				<Route path="/export" element={<LUIExport />} />
				<Route path="/lock" element={<LUILock />} />
				<Route path="/vbm/:id" element={<LUIVBM />} />
				<Route path="/preview/:id" element={<LUISavePreview />} />
				<Route path="/task/:id" element={<LUITask />} />
				<Route path="/reminder/:id" element={<LUIReminder />} />
				<Route path="/note/:id" element={<LUINote />} />
				<Route path="/image/:id" element={<LUIImage />} />
				<Route path="/pick-file" element={<LUIFileInput />} />
				<Route path="/import-profile" element={<LUIImportProfile />} />
				<Route path="/ai" element={<LUIAI />} />
				{/* An unknown route goes to Home, which sends a locked profile
				    on to the profile picker. */}
				<Route path="*" element={<Navigate to="/home" replace />} />
			</Routes>
		</AnimatePresence>
	);
}

function App() {
	return (
		<LUIErrorBoundary>
			{/* Honours the system's reduced-motion setting for every
			    framer-motion animation; index.css covers CSS ones. */}
			<MotionConfig reducedMotion="user">
				<HashRouter>
					<UIStateProvider>
						<ThemeContextProvider>
							<RecordsProvider>
								<SessionRedirect />
								<AnimatedRoutes />
								<LUIToasts />
							</RecordsProvider>
						</ThemeContextProvider>
					</UIStateProvider>
				</HashRouter>
			</MotionConfig>
		</LUIErrorBoundary>
	);
}

export default App;
