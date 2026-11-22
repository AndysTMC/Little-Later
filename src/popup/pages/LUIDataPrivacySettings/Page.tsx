import { useState } from "react";
import { motion } from "framer-motion";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { LINITIAL_MISC_SETTINGS } from "little-shared/constants";
import { LTHEME } from "little-shared/enums";
import type { LExternalMcpMode, LUserSettings } from "little-shared/types";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISettingSelect } from "../../components/LUISettingRow/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIPillButton } from "../../components/LUIPillButton/Component";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { useLoading } from "../../hooks/useLoading";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { attempt } from "../../attempt";
import { send } from "../../../utils/send";
import {
	MAX_IGNORED_DOMAINS,
	normalizeIgnoredEntry,
} from "../../../utils/ignoredUrls";

const CHAT_RETENTION_OPTIONS: ReadonlyArray<{ value: number; label: string }> =
	[
		{ value: 0, label: "Keep forever" },
		{ value: 30, label: "After 30 days" },
		{ value: 7, label: "After 7 days" },
		{ value: -1, label: "When profile locks" },
	];

const EXTERNAL_MCP_OPTIONS: ReadonlyArray<{
	value: LExternalMcpMode;
	label: string;
}> = [
	{ value: "off", label: "Off" },
	{ value: "read", label: "Read-only" },
	{ value: "write", label: "Read & write" },
];

const BACKUP_REMINDER_OPTIONS: ReadonlyArray<{
	value: number;
	label: string;
}> = [
	{ value: 0, label: "Off" },
	{ value: 14, label: "Every 14 days" },
	{ value: 30, label: "Every 30 days" },
];

const Page = () => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const pageMotion = usePageMotion();
	const go = useMoveNavigate();
	const userSettings = useCurrentUserSettings();
	const loading = useLoading([userSettings]);
	const [ignoreInput, setIgnoreInput] = useState("");

	const misc: LUserSettings["misc"] =
		userSettings?.misc ?? LINITIAL_MISC_SETTINGS.value;
	const ignoredDomains = misc.ignoredDomains ?? [];

	const updateMisc = (
		patch: Partial<typeof misc>,
		failureMessage: string,
	) => {
		if (!userSettings) return;
		void attempt(
			() =>
				send("settings.update", {
					misc: { ...userSettings.misc, ...patch },
				}),
			failureMessage,
		);
	};

	const addIgnoredDomain = () => {
		const normalized = normalizeIgnoredEntry(ignoreInput);
		if (
			normalized === "" ||
			ignoredDomains.includes(normalized) ||
			ignoredDomains.length >= MAX_IGNORED_DOMAINS
		) {
			setIgnoreInput("");
			return;
		}
		updateMisc(
			{ ignoredDomains: [...ignoredDomains, normalized] },
			"Couldn't update ignored sites.",
		);
		setIgnoreInput("");
	};

	const removeIgnoredDomain = (entry: string) => {
		updateMisc(
			{
				ignoredDomains: ignoredDomains.filter((item) => item !== entry),
			},
			"Couldn't update ignored sites.",
		);
	};

	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings" />
			{loading || !userSettings ? (
				<LUILoading />
			) : (
				<LUISettingsLayout pageName="Data & Privacy">
					<div className="flex w-full flex-col gap-y-4 pt-1 pb-6">
						<div className="flex flex-col gap-y-2">
							<div
								className={`text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}
							>
								History & retention
							</div>
							<LUISettingSelect
								label="Clear AI chats"
								value={misc.chatRetentionDays ?? 0}
								options={CHAT_RETENTION_OPTIONS}
								onChange={(days) =>
									updateMisc(
										{ chatRetentionDays: days },
										"Couldn't update AI chat retention.",
									)
								}
							/>
							<LUISettingSelect
								label="Backup reminder"
								value={misc.backupReminderDays ?? 0}
								options={BACKUP_REMINDER_OPTIONS}
								onChange={(days) =>
									updateMisc(
										{ backupReminderDays: days },
										"Couldn't update backup reminder.",
									)
								}
							/>
							<div className="flex items-center justify-between gap-x-3 py-1">
								<span
									className={`text-sm font-medium ${isDark ? "text-neutral-100" : "text-neutral-900"}`}
								>
									Encrypted backup
								</span>
								<LUIPillButton
									label="Export"
									onClick={() => go("/export", "forward")}
								/>
							</div>
						</div>

						<div
							className={`flex flex-col gap-y-2 border-t pt-3 ${
								isDark
									? "border-neutral-800"
									: "border-neutral-200"
							}`}
						>
							<div className="flex flex-col gap-y-0.5">
								<span
									className={`text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}
								>
									Ignored sites & URLs
								</span>
								<span
									className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
								>
									Skip automatic history capture on matching
									domains or URL prefixes (e.g. localhost,
									mail.google.com).
								</span>
							</div>
							<div className="flex items-center gap-x-1.5">
								<input
									type="text"
									value={ignoreInput}
									aria-label="Add ignored domain or URL"
									placeholder="example.com or https://..."
									onChange={(event) =>
										setIgnoreInput(event.target.value)
									}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											addIgnoredDomain();
										}
									}}
									className={`ll-field h-9 min-w-0 grow rounded-xl border px-3 text-xs transition-colors ${
										isDark
											? "border-neutral-800 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500"
											: "border-neutral-200 bg-neutral-100 text-neutral-900 placeholder:text-neutral-500"
									}`}
								/>
								<button
									type="button"
									aria-label="Add ignored site"
									disabled={
										normalizeIgnoredEntry(ignoreInput) ===
										""
									}
									onClick={addIgnoredDomain}
									className={`flex h-9 shrink-0 cursor-pointer items-center gap-x-1 rounded-xl border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
										isDark
											? "border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
											: "border-neutral-200 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
									}`}
								>
									<LUIThemedIcon
										Icon={PlusIcon}
										color="currentColor"
										weight="bold"
										className="size-3.5"
									/>
									<span>Add</span>
								</button>
							</div>
							{ignoredDomains.length > 0 ? (
								<div className="flex flex-wrap gap-1.5 pt-0.5">
									{ignoredDomains.map((entry) => (
										<span
											key={entry}
											className={`inline-flex max-w-full items-center gap-x-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs font-medium ${
												isDark
													? "border-neutral-800 bg-neutral-900 text-neutral-200"
													: "border-neutral-200 bg-neutral-100 text-neutral-800"
											}`}
										>
											<span className="truncate">
												{entry}
											</span>
											<button
												type="button"
												aria-label={`Remove ${entry}`}
												onClick={() =>
													removeIgnoredDomain(entry)
												}
												className={`flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
													isDark
														? "text-neutral-400 hover:bg-neutral-800 hover:text-white"
														: "text-neutral-500 hover:bg-neutral-200 hover:text-black"
												}`}
											>
												<LUIThemedIcon
													Icon={XIcon}
													color="currentColor"
													weight="bold"
													className="size-2.5"
												/>
											</button>
										</span>
									))}
								</div>
							) : null}
						</div>

						<div
							className={`flex flex-col gap-y-2 border-t pt-3 ${
								isDark
									? "border-neutral-800"
									: "border-neutral-200"
							}`}
						>
							<div
								className={`text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}
							>
								External agent access
							</div>
							<LUISettingSelect
								label="External agent MCP"
								value={misc.externalMcpMode ?? "off"}
								options={EXTERNAL_MCP_OPTIONS}
								onChange={(mode) => {
									void attempt(async () => {
										if (
											mode !== "off" &&
											typeof chrome !== "undefined" &&
											chrome.permissions?.request
										) {
											try {
												const granted =
													await chrome.permissions.request(
														{
															permissions: [
																"nativeMessaging",
															],
														},
													);
												if (!granted) {
													throw new Error(
														"Native messaging permission was denied.",
													);
												}
											} catch (error) {
												if (
													error instanceof Error &&
													error.message.includes(
														"denied",
													)
												) {
													throw error;
												}
											}
										}
										await send("settings.update", {
											misc: {
												...userSettings.misc,
												externalMcpMode: mode,
											},
										});
									}, "Couldn't update external MCP access.");
								}}
							/>
							<LUINote className="w-full">
								External MCP connects locally over Chrome Native
								Messaging only while this profile is unlocked.
								Locked notes, passwords, API keys, and vault
								keys are never exposed.
							</LUINote>
						</div>
					</div>
				</LUISettingsLayout>
			)}
		</motion.div>
	);
};

export { Page as LUIDataPrivacySettings };
