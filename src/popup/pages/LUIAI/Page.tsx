import { useEffect } from "react";
import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { ChatScreen, type Surface } from "../../../panel/ChatScreen";
import { Locked } from "../../../panel/Locked";
import { listenForFiles } from "../../../utils/saveFile";
import { LUILoading } from "../../components/LUILoading/Component";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { useProfileKeys } from "../../hooks/useSession";
import { useTheme } from "../../hooks/useTheme";

// LittleAI inside the extension's main router: used when Side panel is set
// to "Everything" (inside the side panel) or "None" (inside the popup).
const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const go = useMoveNavigate();
	const keys = useProfileKeys();
	useEffect(() => listenForFiles(), []);
	const surface: Surface =
		document.documentElement.dataset.surface === "panel"
			? "panel"
			: document.documentElement.dataset.surface === "tab"
				? "tab"
				: "popup";

	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-hidden ${theme === LTHEME.DARK ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			{keys === undefined ? (
				<LUILoading />
			) : keys === null ? (
				<Locked />
			) : (
				<ChatScreen
					key={keys.profileId}
					keys={keys}
					surface={surface}
					onBack={() => go("/home", "back")}
					onOpenSettings={() => go("/settings/ai", "forward")}
				/>
			)}
		</motion.div>
	);
};

export { Page as LUIAI };
