import { useState } from "react";
import { motion } from "framer-motion";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import type { LAIMcpServer } from "little-shared/types";
import { send } from "../../../utils/send";
import { attempt } from "../../attempt";
import { useTheme } from "../../hooks/useTheme";
import { usePageMotion } from "../../hooks/usePageMove";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { useLoading } from "../../hooks/useLoading";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUIPillButton } from "../../components/LUIPillButton/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { isLoopbackUrl } from "../../../services/ai/config";
import {
	MAX_MCP_SERVERS,
	resolveMcpServers,
	testMcpServer,
	type McpServerTestResult,
} from "../../../services/ai/mcpClient";

const getLoopbackUrlProblem = (value: string): string | null => {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return "Enter a local URL, like http://127.0.0.1:3001/mcp";
	}
	if (
		(parsed.protocol === "http:" || parsed.protocol === "https:") &&
		isLoopbackUrl(parsed)
	) {
		return null;
	}
	return "Local MCP servers must use localhost, 127.0.0.1, or [::1]";
};

const shortHost = (url: string): string => {
	try {
		const parsed = new URL(url);
		return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
	} catch {
		return url;
	}
};

/**
 * MCP Tool Servers sub-page (`/settings/ai/mcp`). Lets users connect, toggle,
 * test, and remove multiple local loopback MCP tool servers for Little AI.
 */
const Page = () => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const pageMotion = usePageMotion();
	const userSettings = useCurrentUserSettings();
	const loading = useLoading([userSettings]);

	const [nameInput, setNameInput] = useState("");
	const [urlInput, setUrlInput] = useState("");
	const [testingId, setTestingId] = useState<string | null>(null);
	const [results, setResults] = useState<Record<string, McpServerTestResult>>(
		{},
	);

	const ai = userSettings?.ai;
	const servers = resolveMcpServers(ai);

	const persistServers = (
		next: Array<LAIMcpServer>,
		failureMessage: string,
	) => {
		if (!ai) return;
		void attempt(
			() =>
				send("settings.update", {
					ai: {
						...ai,
						mcpServerUrl: "",
						mcpServers: next,
					},
				}),
			failureMessage,
		);
	};

	const urlProblem = getLoopbackUrlProblem(urlInput);
	const canAdd =
		urlInput.trim() !== "" &&
		urlProblem === null &&
		servers.length < MAX_MCP_SERVERS;

	const handleAdd = () => {
		if (!canAdd) return;
		const cleanUrl = urlInput.trim();
		const fallbackName = shortHost(cleanUrl).slice(0, 60) || "Local MCP";
		const entry: LAIMcpServer = {
			id: crypto.randomUUID(),
			name: nameInput.trim().slice(0, 60) || fallbackName,
			url: cleanUrl,
			enabled: true,
		};
		setNameInput("");
		setUrlInput("");
		persistServers([...servers, entry], "Couldn't add that MCP server.");
	};

	const handleToggle = (id: string) => {
		persistServers(
			servers.map((server) =>
				server.id === id
					? { ...server, enabled: !server.enabled }
					: server,
			),
			"Couldn't update that MCP server.",
		);
	};

	const handleRemove = (id: string) => {
		setResults((prev) => {
			const next = { ...prev };
			delete next[id];
			return next;
		});
		persistServers(
			servers.filter((server) => server.id !== id),
			"Couldn't remove that MCP server.",
		);
	};

	const handleTest = async (server: LAIMcpServer) => {
		if (testingId !== null) return;
		setTestingId(server.id);
		try {
			const res = await testMcpServer(server.url);
			setResults((prev) => ({ ...prev, [server.id]: res }));
		} finally {
			setTestingId(null);
		}
	};

	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings/ai" />
			{loading || !ai ? (
				<LUILoading />
			) : (
				<LUISettingsLayout pageName="MCP Tool Servers">
					<div className="flex w-full flex-col gap-y-4 pt-1 pb-4">
						<div className="flex flex-col gap-y-2">
							<div
								className={`text-sm font-semibold ${isDark ? "text-white" : "text-black"}`}
							>
								Add a local server
							</div>
							<LUITextInputT1
								name="Server name (optional)"
								passedValue={nameInput}
								onChange={setNameInput}
								lengthLimit={60}
								disableLengthCounter
								validate={() => ({ success: true, error: "" })}
							/>
							<LUITextInputT1
								name="Local server URL"
								inputType="url"
								passedValue={urlInput}
								onChange={setUrlInput}
								lengthLimit={256}
								disableLengthCounter
								validate={(value) => {
									const problem =
										getLoopbackUrlProblem(value);
									return {
										success: problem === null,
										error: problem ?? "",
									};
								}}
							/>
							<div className="flex items-center justify-between pt-0.5">
								<span
									className={`text-xs ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
								>
									{servers.length} of {MAX_MCP_SERVERS}{" "}
									servers
								</span>
								<button
									type="button"
									disabled={!canAdd}
									onClick={handleAdd}
									className={`flex h-8 cursor-pointer items-center gap-x-1 rounded-xl border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
										isDark
											? "border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800"
											: "border-neutral-300 bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
									}`}
								>
									<LUIThemedIcon
										Icon={PlusIcon}
										color="currentColor"
										weight="bold"
										className="size-3.5"
									/>
									<span>Add server</span>
								</button>
							</div>
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
								Configured servers
							</div>
							{servers.length === 0 ? (
								<div
									className={`rounded-xl border px-3.5 py-3 text-xs ${
										isDark
											? "border-neutral-800 bg-neutral-900 text-neutral-400"
											: "border-neutral-200 bg-neutral-100 text-neutral-600"
									}`}
								>
									No local MCP servers added yet. Add any
									loopback JSON-RPC MCP endpoint (such as{" "}
									<code>http://127.0.0.1:3001/mcp</code>) to
									give Little AI extra local tools.
								</div>
							) : (
								<div className="flex flex-col gap-2">
									{servers.map((server) => {
										const status = results[server.id];
										return (
											<div
												key={server.id}
												className={`flex flex-col gap-2 rounded-xl border px-3 py-2.5 ${
													isDark
														? "border-neutral-800 bg-neutral-900"
														: "border-neutral-200 bg-neutral-100"
												}`}
											>
												<div className="flex items-center justify-between gap-2">
													<div className="min-w-0">
														<div
															className={`truncate text-xs font-semibold ${
																isDark
																	? "text-white"
																	: "text-black"
															}`}
														>
															{server.name}
														</div>
														<div
															className={`truncate text-[11px] ${
																isDark
																	? "text-neutral-400"
																	: "text-neutral-600"
															}`}
														>
															{shortHost(
																server.url,
															)}
														</div>
													</div>
													<div className="flex shrink-0 items-center gap-1.5">
														<button
															type="button"
															role="switch"
															aria-checked={
																server.enabled
															}
															aria-label={`Enable ${server.name}`}
															onClick={() =>
																handleToggle(
																	server.id,
																)
															}
															className={`h-7 cursor-pointer rounded-lg border px-2 text-[11px] font-medium transition-colors ${
																server.enabled
																	? "ll-accent-fill border-transparent"
																	: isDark
																		? "border-neutral-700 bg-neutral-950 text-neutral-400 hover:text-white"
																		: "border-neutral-300 bg-white text-neutral-600 hover:text-black"
															}`}
														>
															{server.enabled
																? "On"
																: "Paused"}
														</button>
														<LUIPillButton
															label={
																testingId ===
																server.id
																	? "Testing…"
																	: "Test"
															}
															disabled={
																testingId !==
																null
															}
															onClick={() =>
																void handleTest(
																	server,
																)
															}
														/>
														<button
															type="button"
															aria-label={`Remove ${server.name}`}
															onClick={() =>
																handleRemove(
																	server.id,
																)
															}
															className={`flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors ${
																isDark
																	? "text-neutral-400 hover:bg-neutral-800 hover:text-white"
																	: "text-neutral-500 hover:bg-neutral-200 hover:text-black"
															}`}
														>
															<LUIThemedIcon
																Icon={XIcon}
																color="currentColor"
																weight="regular"
																className="size-3.5"
															/>
														</button>
													</div>
												</div>
												{status ? (
													<LUINote
														warning={!status.ok}
														className="w-full"
													>
														{status.message}
													</LUINote>
												) : null}
											</div>
										);
									})}
								</div>
							)}
						</div>

						<LUINote className="w-full">
							Only local loopback servers (localhost, 127.0.0.1,
							or [::1]) are permitted. Every MCP tool call
							requires your explicit confirmation in Little AI
							chat before running.
						</LUINote>
					</div>
				</LUISettingsLayout>
			)}
		</motion.div>
	);
};

export { Page as LUIAIMcpSettings };
