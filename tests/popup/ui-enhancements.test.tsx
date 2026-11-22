import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { LTHEME } from "little-shared/enums";
import { ThemeContext } from "../../src/popup/contexts/ThemeContext";
import { UIStateContext } from "../../src/popup/contexts/UIStateContext";
import { LUICUButton } from "../../src/popup/components/LUICUButton/Component";
import { LUINoteMini } from "../../src/popup/components/LUINoteMini/Component";
import { LUIAuthGate } from "../../src/popup/components/LUIAuthGate/Component";
import { LUIFileInput } from "../../src/popup/pages/LUIFileInput/Page";
import { pickRoute } from "../../src/popup/filePick";
import { AVATAR_REQUEST } from "../../src/popup/components/LUIAvatarInput/request";
import { Markdown } from "../../src/panel/Markdown";
import {
	applySidePanelMode,
	getSidePanelMode,
	setSidePanelMode,
	SIDE_PANEL_STORAGE_KEY,
} from "../../src/services/sidePanel";

const renderWithTheme = async (node: React.ReactNode) => {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root: Root = createRoot(container);
	await act(async () => {
		root.render(
			<ThemeContext.Provider
				value={{
					theme: LTHEME.DARK,
					preference: "dark",
					toggleTheme: vi.fn(),
					setTheme: vi.fn(),
					setPreference: vi.fn(),
					accent: "mono",
					setAccent: vi.fn(),
					accentColor: "#ffffff",
					setAccentColor: vi.fn(),
					showLookOf: vi.fn(),
				}}
			>
				{node}
			</ThemeContext.Provider>,
		);
	});
	return {
		container,
		unmount: async () => {
			await act(async () => {
				root.unmount();
			});
			container.remove();
		},
	};
};

describe("Side panel mode service", () => {
	const originalChrome = globalThis.chrome;

	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		globalThis.chrome = originalChrome;
	});

	it("defaults to ai and persists everything / none modes", async () => {
		expect(await getSidePanelMode()).toBe("ai");
		await setSidePanelMode("everything");
		expect(await getSidePanelMode()).toBe("everything");
		await setSidePanelMode("none");
		expect(await getSidePanelMode()).toBe("none");
		localStorage.setItem(SIDE_PANEL_STORAGE_KEY, JSON.stringify("invalid"));
		expect(await getSidePanelMode()).toBe("ai");
	});

	it("applies chrome.sidePanel options and panel behavior for every mode", async () => {
		const setOptions = vi.fn().mockResolvedValue(undefined);
		const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
		globalThis.chrome = {
			sidePanel: { setOptions, setPanelBehavior },
		} as unknown as typeof chrome;

		await applySidePanelMode("everything");
		expect(setOptions).toHaveBeenLastCalledWith({
			path: "index.html?surface=panel",
			enabled: true,
		});
		expect(setPanelBehavior).toHaveBeenLastCalledWith({
			openPanelOnActionClick: true,
		});

		await applySidePanelMode("ai");
		expect(setOptions).toHaveBeenLastCalledWith({
			path: "sidepanel.html",
			enabled: true,
		});
		expect(setPanelBehavior).toHaveBeenLastCalledWith({
			openPanelOnActionClick: false,
		});

		await applySidePanelMode("none");
		expect(setOptions).toHaveBeenLastCalledWith({
			enabled: false,
		});
		expect(setPanelBehavior).toHaveBeenLastCalledWith({
			openPanelOnActionClick: false,
		});
	});
});

describe("LUICUButton variants", () => {
	it("renders unified solid primary, outlined secondary, and red danger buttons without a caret split", async () => {
		const primary = await renderWithTheme(
			<LUICUButton name="Unlock" onClick={() => undefined} />,
		);
		const primaryBtn = primary.container.querySelector("button")!;
		expect(primaryBtn.className).toContain("ll-accent-fill");
		expect(primaryBtn.className).toContain("rounded-xl");
		expect(primaryBtn.querySelectorAll("svg")).toHaveLength(0);
		await primary.unmount();

		const secondary = await renderWithTheme(
			<LUICUButton
				variant="secondary"
				name="Cancel"
				onClick={() => undefined}
			/>,
		);
		const secondaryBtn = secondary.container.querySelector("button")!;
		expect(secondaryBtn.className).not.toContain("ll-accent-fill");
		expect(secondaryBtn.className).toContain("rounded-xl");
		await secondary.unmount();

		const danger = await renderWithTheme(
			<LUICUButton
				variant="danger"
				name="Confirm delete"
				onClick={() => undefined}
			/>,
		);
		const dangerBtn = danger.container.querySelector("button")!;
		expect(dangerBtn.className).toContain("bg-red-600");
		await danger.unmount();
	});
});

describe("LUINoteMini footer layout", () => {
	it("keeps the timestamp non-wrapping beside the quiet delete button in a full-width card", async () => {
		const view = await renderWithTheme(
			<LUINoteMini
				note={{
					id: "n1",
					content: "Hello!\nBody text",
					locked: false,
					title: "",
					tags: [],
					createdAt: Date.now(),
					updatedAt: Date.now(),
				}}
				onOpen={() => undefined}
				onDelete={() => undefined}
			/>,
		);
		const deleteBtn = view.container.querySelector(
			'button[aria-label="Delete note"]',
		);
		expect(deleteBtn).not.toBeNull();
		const timeEl = view.container.querySelector(".whitespace-nowrap");
		expect(timeEl).not.toBeNull();
		expect(timeEl?.contains(deleteBtn)).toBe(false);
		await view.unmount();
	});
});

describe("LUIAuthGate shortened 2FA labels", () => {
	it("uses shortened 'Use recovery code' and 'Use security key' labels", async () => {
		const view = await renderWithTheme(
			<MemoryRouter>
				<LUIAuthGate
					type="Unlock"
					userProfile={{
						id: "p1",
						name: "Ada",
						hasPassword: true,
						theme: "dark",
						accent: "mono",
						accentColor: null,
						autoLockMinutes: 30,
						authenticators: [
							{
								credentialId: "cred-1",
								name: "Security key",
								prfSalt: "salt-1",
								addedAt: Date.now(),
							},
						],
					}}
					handleFunction={async () => undefined}
				/>
			</MemoryRouter>,
		);
		const labels = Array.from(
			view.container.querySelectorAll("button"),
		).map((button) => button.textContent?.trim());
		expect(labels).toContain("Use recovery code");
		expect(labels).not.toContain("Use a recovery code instead");
		expect(labels).not.toContain("Continue with security key");

		const toggle = Array.from(
			view.container.querySelectorAll("button"),
		).find((b) => b.textContent?.trim() === "Use recovery code")!;
		await act(async () => {
			toggle.click();
		});
		const afterToggle = Array.from(
			view.container.querySelectorAll("button"),
		).map((button) => button.textContent?.trim());
		expect(afterToggle).toContain("Use security key");
		expect(afterToggle).not.toContain("Use the security key instead");
		await view.unmount();
	});
});

describe("LUIFileInput browse button visibility", () => {
	const originalChrome = globalThis.chrome;

	afterEach(() => {
		globalThis.chrome = originalChrome;
	});

	const renderFileInput = () =>
		renderWithTheme(
			<MemoryRouter
				initialEntries={[
					pickRoute(AVATAR_REQUEST, "avatar", "/profile"),
				]}
			>
				<UIStateContext.Provider
					value={{
						getDraft: () => undefined,
						setDraft: vi.fn(),
						clearDraft: vi.fn(),
						clearDrafts: vi.fn(),
						rememberRoute: vi.fn(),
					}}
				>
					<Routes>
						<Route path="/pick-file" element={<LUIFileInput />} />
					</Routes>
				</UIStateContext.Provider>
			</MemoryRouter>,
		);

	it("shows Browse files outside the toolbar popup", async () => {
		const view = await renderFileInput();
		expect(view.container.textContent).toContain("Browse files");
		expect(
			view.container.querySelector('input[type="file"]'),
		).not.toBeNull();
		await view.unmount();
	});

	it("hides Browse files inside the toolbar popup", async () => {
		globalThis.chrome = {
			extension: {
				getViews: () => [window],
			},
		} as unknown as typeof chrome;
		const view = await renderFileInput();
		expect(view.container.textContent).not.toContain("Browse files");
		expect(view.container.querySelector('input[type="file"]')).toBeNull();
		await view.unmount();
	});
});

describe("LittleAI Markdown GFM support", () => {
	it("renders GFM tables", async () => {
		const view = await renderWithTheme(
			<Markdown
				text={"| Task | Status |\n| --- | --- |\n| Ship | Done |"}
			/>,
		);
		expect(view.container.querySelector("table")).not.toBeNull();
		expect(view.container.querySelectorAll("th")).toHaveLength(2);
		expect(view.container.querySelectorAll("td")).toHaveLength(2);
		await view.unmount();
	});
});
