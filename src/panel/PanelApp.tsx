import { MotionConfig } from "framer-motion";
import { ThemeContextProvider } from "../popup/contexts/Theme";
import { LUIErrorBoundary } from "../popup/components/LUIErrorBoundary/Component";
import { LUILoading } from "../popup/components/LUILoading/Component";
import { LUIToasts } from "../popup/components/LUIToasts/Component";
import { useProfileKeys } from "../popup/hooks/useSession";
import { ChatScreen, type Surface } from "./ChatScreen";
import { Locked } from "./Locked";

// LittleAI's side panel, and the same screen opened in a tab (decision
// 0017): the chat when a profile is unlocked, a way to unlock otherwise.
// Nothing else of Little Later lives here.
const Body = ({ surface }: { surface: Surface }) => {
	const keys = useProfileKeys();
	if (keys === undefined) return <LUILoading />;
	if (keys === null) return <Locked />;
	return <ChatScreen key={keys.profileId} keys={keys} surface={surface} />;
};

const PanelApp = ({ surface }: { surface: Surface }) => (
	<LUIErrorBoundary>
		<ThemeContextProvider>
			<MotionConfig reducedMotion="user">
				<Body surface={surface} />
				<LUIToasts />
			</MotionConfig>
		</ThemeContextProvider>
	</LUIErrorBoundary>
);

export { PanelApp };
