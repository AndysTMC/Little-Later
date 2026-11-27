import { motion } from "framer-motion";
import {
	BrainIcon,
	CpuIcon,
	PlugsIcon,
	SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { capitalize } from "little-shared/utils/misc";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISettingLink } from "../../components/LUISettingRow/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { useLoading } from "../../hooks/useLoading";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import {
	describeProcessing,
	getProviderDisplayName,
	isAISettingsConfigured,
} from "../../../services/ai/config";
import { resolveMcpServers } from "../../../services/ai/mcpClient";

/**
 * AI Settings hub (`/settings/ai`), organized into focused sub-screens just
 * like Security settings: Provider & Model, Behavior & Instructions,
 * Memories, and MCP Tool Servers.
 */
const Page = () => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const pageMotion = usePageMotion();
	const userSettings = useCurrentUserSettings();
	const loading = useLoading([userSettings]);

	const ai = userSettings?.ai;
	const configured = isAISettingsConfigured(ai);
	const providerName = ai ? getProviderDisplayName(ai) : "";
	const modelName = ai?.model.trim() ?? "";
	const providerSubtitle = configured
		? `${providerName} · ${modelName}`
		: "Choose a local, cloud, or custom model";

	const verbosity = capitalize(ai?.verbosity ?? "balanced");
	const hasInstructions = Boolean(ai?.instructions?.trim());
	const behaviorSubtitle = hasInstructions
		? `${verbosity} · Custom instructions`
		: `${verbosity} responses`;

	const memoryCount = ai?.memories?.length ?? 0;
	const memoriesSubtitle =
		memoryCount === 0
			? "Preferences and facts Little AI remembers"
			: memoryCount === 1
				? "1 saved memory"
				: `${memoryCount} saved memories`;

	const mcpServers = resolveMcpServers(ai);
	const enabledMcpCount = mcpServers.filter((s) => s.enabled).length;
	const mcpSubtitle =
		mcpServers.length === 0
			? "Connect local MCP servers for extra tools"
			: enabledMcpCount === 0
				? `${mcpServers.length} paused`
				: `${enabledMcpCount} of ${mcpServers.length} enabled`;

	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings" />
			{loading || !ai ? (
				<LUILoading />
			) : (
				<LUISettingsLayout pageName="AI Settings">
					<div className="flex w-full flex-col gap-y-2.5 pt-1 pb-4">
						<LUISettingLink
							label="Provider & Model"
							subtitle={providerSubtitle}
							badge={configured ? "Ready" : "Set up"}
							icon={CpuIcon}
							to="/settings/ai/provider"
							referrer="/settings/ai"
						/>
						<LUISettingLink
							label="Behavior & Instructions"
							subtitle={behaviorSubtitle}
							icon={SlidersHorizontalIcon}
							to="/settings/ai/behavior"
							referrer="/settings/ai"
						/>
						<LUISettingLink
							label="Memories"
							subtitle={memoriesSubtitle}
							badge={
								memoryCount > 0
									? String(memoryCount)
									: undefined
							}
							icon={BrainIcon}
							to="/settings/ai/memories"
							referrer="/settings/ai"
						/>
						<LUISettingLink
							label="MCP Tool Servers"
							subtitle={mcpSubtitle}
							badge={
								enabledMcpCount > 0
									? `${enabledMcpCount} active`
									: undefined
							}
							icon={PlugsIcon}
							to="/settings/ai/mcp"
							referrer="/settings/ai"
						/>
						<LUINote className="mt-1 w-full">
							{describeProcessing(ai)}
						</LUINote>
					</div>
				</LUISettingsLayout>
			)}
		</motion.div>
	);
};

export { Page as LUIAISettings };
