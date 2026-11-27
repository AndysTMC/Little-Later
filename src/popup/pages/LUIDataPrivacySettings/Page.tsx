import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckIcon, CopyIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { LINITIAL_MISC_SETTINGS } from "little-shared/constants";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
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
import { usePickedFile } from "../../hooks/usePickedFile";
import { useTheme } from "../../hooks/useTheme";
import { pickRoute } from "../../filePick";
import { attempt } from "../../attempt";
import { importBookmarksHtml } from "../../../services/portable";
import { createToast } from "../../../services/toasts";
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

const BOOKMARKS_PICK_SLOT = "bookmarks-html";
const MAX_BOOKMARKS_HTML_BYTES = 5 * 1024 * 1024;

const Page = () => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const pageMotion = usePageMotion();
	const go = useMoveNavigate();
	const userSettings = useCurrentUserSettings();
	const loading = useLoading([userSettings]);
	const pickedBookmarks = usePickedFile(BOOKMARKS_PICK_SLOT);
	const importingRef = useRef(false);
	const [importingBookmarks, setImportingBookmarks] = useState(false);
	const [ignoreInput, setIgnoreInput] = useState("");
	const [copiedKey, setCopiedKey] = useState<"install" | "config" | null>(
		null,
	);
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copyTimerRef.current !== null) {
				clearTimeout(copyTimerRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (pickedBookmarks.files.length === 0 || importingRef.current) return;
		importingRef.current = true;
		setImportingBookmarks(true);
		const file = pickedBookmarks.files[0]!;
		void (async () => {
			try {
				const html = await file.blob.text();
				const { imported, truncated } = await importBookmarksHtml(html);
				const baseMsg =
					imported === 1
						? "Imported 1 bookmark."
						: `Imported ${imported} bookmarks.`;
				await createToast(
					truncated > 0
						? `${baseMsg} (${truncated} skipped over the 500-item limit.)`
						: baseMsg,
					LTOAST_TYPE.SUCCESS,
				);
			} catch (error) {
				await createToast(
					error instanceof Error
						? error.message
						: "Couldn't import bookmarks.",
					LTOAST_TYPE.ERROR,
				);
			} finally {
				await pickedBookmarks.remove(file.id);
				importingRef.current = false;
				setImportingBookmarks(false);
			}
		})();
	}, [pickedBookmarks]);

	const extensionId =
		typeof chrome !== "undefined" && chrome.runtime?.id
			? chrome.runtime.id
			: "";
	const OFFICIAL_EXTENSION_ID = "nchfnpignmgklabjemdobnanfickfbhl";
	const installCommand =
		extensionId === "" || extensionId === OFFICIAL_EXTENSION_ID
			? "npx -y little-later-mcp install"
			: `npx -y little-later-mcp install ${extensionId}`;
	const mcpClientConfig = JSON.stringify(
		{
			mcpServers: {
				"little-later": {
					command: "npx",
					args: ["-y", "little-later-mcp", "serve"],
				},
			},
		},
		null,
		2,
	);

	const copyText = (key: "install" | "config", text: string) => {
		if (!navigator.clipboard?.writeText) {
			void createToast("Clipboard is unavailable.", LTOAST_TYPE.ERROR);
			return;
		}
		void navigator.clipboard.writeText(text).then(
			() => {
				setCopiedKey(key);
				if (copyTimerRef.current !== null) {
					clearTimeout(copyTimerRef.current);
				}
				copyTimerRef.current = setTimeout(() => {
					copyTimerRef.current = null;
					setCopiedKey((current) =>
						current === key ? null : current,
					);
				}, 1500);
			},
			() => {
				void createToast(
					"Couldn't copy to clipboard.",
					LTOAST_TYPE.ERROR,
				);
			},
		);
	};

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
									Encrypted backup & exports
								</span>
								<LUIPillButton
									label="Export"
									onClick={() =>
										go("/export", "forward", {
											state: {
												referrer: "/settings/privacy",
											},
										})
									}
								/>
							</div>
							<div className="flex items-center justify-between gap-x-3 py-1">
								<span
									className={`text-sm font-medium ${isDark ? "text-neutral-100" : "text-neutral-900"}`}
								>
									Bookmarks HTML
								</span>
								<LUIPillButton
									label={
										importingBookmarks
											? "Importing…"
											: "Import"
									}
									disabled={importingBookmarks}
									onClick={() =>
										go(
											pickRoute(
												{
													title: "Import bookmarks",
													accepts:
														"HTML bookmark export (.html), up to 5 MB",
													types: null,
													maxBytes:
														MAX_BOOKMARKS_HTML_BYTES,
													maxFiles: 1,
													pasteHint:
														"Drop or paste a bookmarks.html file",
												},
												BOOKMARKS_PICK_SLOT,
												"/settings/privacy",
											),
											"forward",
										)
									}
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
							{(misc.externalMcpMode ?? "off") !== "off" ? (
								<div className="flex flex-col gap-y-2 py-1">
									<label className="flex cursor-pointer items-center justify-between gap-x-3 text-xs">
										<span
											className={
												isDark
													? "text-neutral-300"
													: "text-neutral-700"
											}
										>
											Include browsing history
										</span>
										<input
											type="checkbox"
											checked={Boolean(
												misc.externalMcpAllowHistory,
											)}
											onChange={(event) => {
												if (!userSettings) return;
												const checked =
													event.target.checked;
												void attempt(
													() =>
														send(
															"settings.update",
															{
																misc: {
																	...userSettings.misc,
																	externalMcpAllowHistory:
																		checked ||
																		undefined,
																},
															},
														),
													"Couldn't update external MCP history access.",
												);
											}}
											className="size-4 cursor-pointer accent-[var(--ll-accent)]"
										/>
									</label>
									{(misc.externalMcpMode ?? "off") ===
									"write" ? (
										<label className="flex cursor-pointer items-center justify-between gap-x-3 text-xs">
											<span
												className={
													isDark
														? "text-neutral-300"
														: "text-neutral-700"
												}
											>
												Allow permanent deletions
											</span>
											<input
												type="checkbox"
												checked={Boolean(
													misc.externalMcpAllowDelete,
												)}
												onChange={(event) => {
													if (!userSettings) return;
													const checked =
														event.target.checked;
													void attempt(
														() =>
															send(
																"settings.update",
																{
																	misc: {
																		...userSettings.misc,
																		externalMcpAllowDelete:
																			checked ||
																			undefined,
																	},
																},
															),
														"Couldn't update external MCP delete access.",
													);
												}}
												className="size-4 cursor-pointer accent-[var(--ll-accent)]"
											/>
										</label>
									) : null}
								</div>
							) : null}
							{(misc.externalMcpMode ?? "off") !== "off" ? (
								<div
									className={`flex flex-col gap-y-2.5 rounded-xl border p-3 select-text ${
										isDark
											? "border-neutral-800 bg-neutral-900/70"
											: "border-neutral-200 bg-neutral-100/70"
									}`}
								>
									<div className="flex items-center justify-between gap-x-2">
										<span
											className={`text-xs font-semibold ${isDark ? "text-neutral-200" : "text-neutral-800"}`}
										>
											Connect an external agent
										</span>
										<LUIPillButton
											label="Reconnect"
											onClick={() => {
												if (!userSettings) return;
												void attempt(async () => {
													await send(
														"settings.update",
														{
															misc: {
																...userSettings.misc,
																externalMcpMode:
																	misc.externalMcpMode ??
																	"read",
															},
														},
													);
													await createToast(
														"Reconnecting external MCP…",
														LTOAST_TYPE.SUCCESS,
													);
												}, "Couldn't reconnect external MCP.");
											}}
										/>
									</div>
									<div className="flex flex-col gap-y-1">
										<div className="flex items-center justify-between gap-x-2">
											<span
												className={`text-[11px] font-medium ${isDark ? "text-neutral-400" : "text-neutral-600"}`}
											>
												1. Register Chrome native host
												(once)
											</span>
											<button
												type="button"
												aria-label="Copy install command"
												onClick={() =>
													copyText(
														"install",
														installCommand,
													)
												}
												className={`inline-flex cursor-pointer items-center gap-x-1 rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors ${
													isDark
														? "text-neutral-300 hover:bg-neutral-800"
														: "text-neutral-700 hover:bg-neutral-200"
												}`}
											>
												<LUIThemedIcon
													Icon={
														copiedKey === "install"
															? CheckIcon
															: CopyIcon
													}
													color="currentColor"
													weight="regular"
													className="size-3"
												/>
												<span>
													{copiedKey === "install"
														? "Copied"
														: "Copy"}
												</span>
											</button>
										</div>
										<code
											className={`block overflow-x-auto rounded-lg px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap ${
												isDark
													? "bg-black/70 text-neutral-200"
													: "bg-white text-neutral-800"
											}`}
										>
											{installCommand}
										</code>
									</div>
									<div className="flex flex-col gap-y-1">
										<div className="flex items-center justify-between gap-x-2">
											<span
												className={`text-[11px] font-medium ${isDark ? "text-neutral-400" : "text-neutral-600"}`}
											>
												2. Add to your MCP client
											</span>
											<button
												type="button"
												aria-label="Copy MCP client config"
												onClick={() =>
													copyText(
														"config",
														mcpClientConfig,
													)
												}
												className={`inline-flex cursor-pointer items-center gap-x-1 rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors ${
													isDark
														? "text-neutral-300 hover:bg-neutral-800"
														: "text-neutral-700 hover:bg-neutral-200"
												}`}
											>
												<LUIThemedIcon
													Icon={
														copiedKey === "config"
															? CheckIcon
															: CopyIcon
													}
													color="currentColor"
													weight="regular"
													className="size-3"
												/>
												<span>
													{copiedKey === "config"
														? "Copied"
														: "Copy"}
												</span>
											</button>
										</div>
										<pre
											className={`overflow-x-auto rounded-lg px-2.5 py-1.5 font-mono text-[11px] leading-relaxed ${
												isDark
													? "bg-black/70 text-neutral-200"
													: "bg-white text-neutral-800"
											}`}
										>
											{mcpClientConfig}
										</pre>
									</div>
								</div>
							) : null}
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
