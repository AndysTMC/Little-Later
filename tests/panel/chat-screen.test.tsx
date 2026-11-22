import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAI_PROVIDERS, LTHEME } from "little-shared/enums";
import { ThemeContext } from "../../src/popup/contexts/ThemeContext";
import { currentOwner } from "../../src/services/ai/owner";
import { send } from "../../src/utils/send";
import { readSettings } from "../../src/services/ai/records";
import { freshProfile } from "../ai/profile";
import { ChatScreen } from "../../src/panel/ChatScreen";

const mockModels = vi.fn<() => Promise<Array<string>>>();

vi.mock("../../src/services/ai/config", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("../../src/services/ai/config")>();
	return {
		...actual,
		fetchProviderModels: () => mockModels(),
	};
});

const themeValue = {
	theme: LTHEME.LIGHT,
	preference: "light" as const,
	toggleTheme: () => {},
	setTheme: () => {},
	setPreference: () => {},
	accent: "mono" as const,
	setAccent: () => {},
	accentColor: "#0e7490",
	setAccentColor: () => {},
	showLookOf: () => {},
};

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	mockModels.mockReset();
	mockModels.mockResolvedValue(["llama3.2", "qwen2.5:14b"]);
	await freshProfile();
	await send("settings.update", {
		ai: {
			provider: LAI_PROVIDERS.OLLAMA,
			baseUrl: "",
			apiKey: "",
			model: "llama3.2",
		},
	});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const flush = async () => {
	for (let i = 0; i < 6; i++) {
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 15));
		});
	}
};

describe("ChatScreen header and in-chat model switcher", () => {
	it("omits Open in a tab and lets the user switch models directly in chat", async () => {
		const keys = await (await currentOwner()).keys();
		expect(keys).not.toBeNull();

		await act(async () => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<ChatScreen keys={keys!} />
				</ThemeContext.Provider>,
			);
		});
		await flush();

		// "Open in a tab" must not exist anywhere on the screen.
		expect(
			container.querySelector('button[aria-label="Open in a tab"]'),
		).toBeNull();
		expect(container.textContent).not.toContain("Open in a tab");

		// Model switcher trigger shows active model and opens listbox.
		const trigger = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Model: llama3.2, change"]',
		);
		expect(trigger).not.toBeNull();

		await act(async () => {
			trigger!.click();
		});
		await flush();

		const options = Array.from(
			container.querySelectorAll<HTMLButtonElement>(
				'button[role="option"]',
			),
		);
		expect(options.map((el) => el.textContent?.trim())).toEqual([
			"llama3.2",
			"qwen2.5:14b",
		]);

		// Selecting another model updates persisted AI settings immediately.
		const qwenOption = options.find((el) =>
			el.textContent?.includes("qwen2.5:14b"),
		);
		expect(qwenOption).toBeDefined();
		await act(async () => {
			qwenOption!.click();
		});
		await flush();

		const updated = await readSettings(keys!);
		expect(updated.ai.model).toBe("qwen2.5:14b");
	});
});
