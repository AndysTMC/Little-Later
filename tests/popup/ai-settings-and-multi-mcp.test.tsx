import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAI_PROVIDERS, LTHEME } from "little-shared/enums";
import { ThemeContext } from "../../src/popup/contexts/ThemeContext";
import {
	UIStateContext,
	type UIStateStore,
} from "../../src/popup/contexts/UIStateContext";
import { LUIAISettings } from "../../src/popup/pages/LUIAISettings/Page";
import { LUIAIProviderSettings } from "../../src/popup/pages/LUIAIProviderSettings/Page";
import { LUIAIMcpSettings } from "../../src/popup/pages/LUIAIMcpSettings/Page";
import { getProviderDisplayName } from "../../src/services/ai/config";
import { resolveMcpServers } from "../../src/services/ai/mcpClient";
import { LittleAI } from "../../src/services/ai/main";
import { currentOwner } from "../../src/services/ai/owner";
import { littleDB } from "../../src/storage/pageDB";
import { getSettings } from "../../src/storage/repositories";
import { importProfileKeys } from "../../src/storage/keys";
import { sessionStore } from "../../src/storage/session";
import { send } from "../../src/utils/send";

const memoryStore = (): UIStateStore => {
	const drafts = new Map<string, unknown>();
	return {
		getDraft: (key) => drafts.get(key),
		setDraft: (key, value) => void drafts.set(key, value),
		clearDraft: (key) => void drafts.delete(key),
		clearDrafts: () => drafts.clear(),
		rememberRoute: () => {},
	};
};

const themeValue = {
	theme: LTHEME.LIGHT,
	toggleTheme: () => {},
	setTheme: () => {},
	preference: "light" as const,
	setPreference: () => {},
	accent: "mono" as const,
	setAccent: () => {},
	accentColor: "#0e7490",
	setAccentColor: () => {},
	showLookOf: () => {},
};

const setInputValue = async (input: HTMLInputElement, value: string) => {
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(
			window.HTMLInputElement.prototype,
			"value",
		)?.set;
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	});
};

describe("AI Settings redesign & multi-MCP support", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		(
			globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
		).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		await littleDB.open();
		await sessionStore.clear();
		await send("profile.create", { name: "Ada", password: null });
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await act(async () => root.unmount());
		container.remove();
		await sessionStore.clear();
	});

	it("resolves human-friendly provider names and migrates legacy mcpServerUrl", () => {
		expect(
			getProviderDisplayName({
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "https://api.openai.com/v1",
			}),
		).toBe("OpenAI");
		expect(
			getProviderDisplayName({
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl:
					"https://generativelanguage.googleapis.com/v1beta/openai",
			}),
		).toBe("Google Gemini");
		expect(
			getProviderDisplayName({
				provider: LAI_PROVIDERS.OLLAMA,
				baseUrl: "",
			}),
		).toBe("Ollama");

		expect(
			resolveMcpServers({
				mcpServerUrl: "http://127.0.0.1:3001/mcp",
			}),
		).toEqual([
			{
				id: "legacy-local-mcp",
				name: "Local MCP",
				url: "http://127.0.0.1:3001/mcp",
				enabled: true,
			},
		]);
	});

	it("renders AI Settings as a clean hub with live status summaries", async () => {
		await send("settings.update", {
			ai: {
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "https://api.openai.com/v1",
				apiKey: "sk-test",
				model: "gpt-4o",
				verbosity: "concise",
				instructions: "Use bullets.",
				memories: [
					{ id: "m1", text: "Prefers TypeScript", createdAt: 1000 },
				],
				mcpServers: [
					{
						id: "s1",
						name: "Filesystem",
						url: "http://127.0.0.1:3001/mcp",
						enabled: true,
					},
					{
						id: "s2",
						name: "Git",
						url: "http://127.0.0.1:3002/mcp",
						enabled: false,
					},
				],
			},
		});

		await act(async () => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<UIStateContext.Provider value={memoryStore()}>
						<MemoryRouter initialEntries={["/settings/ai"]}>
							<Routes>
								<Route
									path="/settings/ai"
									element={<LUIAISettings />}
								/>
							</Routes>
						</MemoryRouter>
					</UIStateContext.Provider>
				</ThemeContext.Provider>,
			);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toContain("OpenAI · gpt-4o");
		});
		expect(container.textContent).toContain("Provider & Model");
		expect(container.textContent).toContain("Behavior & Instructions");
		expect(container.textContent).toContain(
			"Concise · Custom instructions",
		);
		expect(container.textContent).toContain("1 saved memory");
		expect(container.textContent).toContain("1 of 2 enabled");
	});

	it("hides fixed URLs for Cloud and Local presets, uses clean API Key label, and shows Base URL only for Custom", async () => {
		await send("settings.update", {
			ai: {
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "https://api.openai.com/v1",
				apiKey: "sk-openai",
				model: "gpt-4o",
			},
		});

		await act(async () => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<UIStateContext.Provider value={memoryStore()}>
						<MemoryRouter
							initialEntries={["/settings/ai/provider"]}
						>
							<Routes>
								<Route
									path="/settings/ai/provider"
									element={<LUIAIProviderSettings />}
								/>
							</Routes>
						</MemoryRouter>
					</UIStateContext.Provider>
				</ThemeContext.Provider>,
			);
		});

		await vi.waitFor(() => {
			expect(
				container.querySelector('input[type="password"]'),
			).toBeTruthy();
		});

		// Cloud tab: no Base URL input, clean "API Key" label (not "Custom provider only").
		expect(container.querySelector('input[type="url"]')).toBeNull();
		expect(container.textContent).not.toContain("Custom provider only");
		expect(container.textContent).not.toContain("Built-in URL");
		expect(
			container.querySelector('input[placeholder="API Key"]'),
		).toBeTruthy();

		// Switching to DeepSeek clears the OpenAI API key.
		const deepSeek = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.trim() === "DeepSeek",
		);
		await act(async () => deepSeek!.click());
		expect(
			(
				container.querySelector(
					'input[type="password"]',
				) as HTMLInputElement
			).value,
		).toBe("");

		// Local tab: no Base URL, no "Built-in URL", no API Key.
		const localTab = Array.from(
			container.querySelectorAll('[role="tab"]'),
		).find((b) => b.textContent?.trim() === "Local") as HTMLButtonElement;
		await act(async () => localTab.click());
		expect(container.querySelector('input[type="url"]')).toBeNull();
		expect(container.querySelector('input[type="password"]')).toBeNull();
		expect(container.textContent).not.toContain("Built-in URL");

		// Custom tab: shows Base URL + API Key (optional).
		const customTab = Array.from(
			container.querySelectorAll('[role="tab"]'),
		).find((b) => b.textContent?.trim() === "Custom") as HTMLButtonElement;
		await act(async () => customTab.click());
		expect(container.querySelector('input[type="url"]')).toBeTruthy();
		expect(
			container.querySelector('input[placeholder="API Key (optional)"]'),
		).toBeTruthy();
	});

	it("manages multiple local MCP servers in UI and disambiguates duplicate tools across servers in LittleAI", async () => {
		await act(async () => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<UIStateContext.Provider value={memoryStore()}>
						<MemoryRouter initialEntries={["/settings/ai/mcp"]}>
							<Routes>
								<Route
									path="/settings/ai/mcp"
									element={<LUIAIMcpSettings />}
								/>
							</Routes>
						</MemoryRouter>
					</UIStateContext.Provider>
				</ThemeContext.Provider>,
			);
		});

		await vi.waitFor(() => {
			expect(
				container.querySelector(
					'input[placeholder="Local server URL"]',
				),
			).toBeTruthy();
		});

		const nameInput = container.querySelector<HTMLInputElement>(
			'input[placeholder="Server name (optional)"]',
		)!;
		const urlInput = container.querySelector<HTMLInputElement>(
			'input[placeholder="Local server URL"]',
		)!;
		const addButton = () =>
			Array.from(container.querySelectorAll("button")).find((b) =>
				b.textContent?.includes("Add server"),
			)!;

		// Non-loopback URL is blocked.
		await setInputValue(urlInput, "https://remote.evil.example/mcp");
		expect(addButton().disabled).toBe(true);

		// Add two valid local MCP servers.
		await setInputValue(nameInput, "Filesystem");
		await setInputValue(urlInput, "http://127.0.0.1:3001/mcp");
		await act(async () => addButton().click());

		await vi.waitFor(() => {
			expect(container.textContent).toContain("Filesystem");
		});

		const freshNameInput = container.querySelector<HTMLInputElement>(
			'input[placeholder="Server name (optional)"]',
		)!;
		const freshUrlInput = container.querySelector<HTMLInputElement>(
			'input[placeholder="Local server URL"]',
		)!;
		await setInputValue(freshNameInput, "Git");
		await setInputValue(freshUrlInput, "http://localhost:3002/mcp");
		expect(addButton().disabled).toBe(false);
		await act(async () => addButton().click());

		await vi.waitFor(() => {
			expect(container.textContent).toContain("Git");
		});

		const keys = await importProfileKeys((await sessionStore.get())!);
		const saved = await getSettings(littleDB, keys);
		expect(saved.ai.mcpServers).toHaveLength(2);

		// Verify LittleAI discovers tools from BOTH servers and disambiguates
		// identical tool names ("status") across them.
		await send("settings.update", {
			ai: {
				...saved.ai,
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "http://127.0.0.1:9999/v1",
				apiKey: "",
				model: "m",
			},
		});

		const sentTools: Array<string> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
			const target = String(url);
			if (target.includes(":3001") || target.includes(":3002")) {
				return new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						id: "1",
						result: {
							tools: [
								{
									name: "status",
									description: "Check status",
									inputSchema: {
										type: "object",
										properties: {},
									},
								},
							],
						},
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}
			const body = JSON.parse(String(init?.body)) as {
				tools?: Array<{ function?: { name?: string } }>;
			};
			for (const t of body.tools ?? []) {
				if (t.function?.name?.startsWith("mcp__")) {
					sentTools.push(t.function.name);
				}
			}
			return new Response(
				JSON.stringify({
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: "Done." },
							finish_reason: "stop",
						},
					],
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			);
		});

		const owner = await currentOwner();
		const ai = await LittleAI.getLAIAssistInstance(owner);
		await ai.prompt("Check both servers");
		expect(sentTools).toEqual(["mcp__status", "mcp__git__status"]);
	});
});
