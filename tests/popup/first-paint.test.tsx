import { act, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ThemeContext,
	ThemeContextProvider,
} from "../../src/popup/contexts/Theme";
import { LUIIntro } from "../../src/popup/pages/LUIIntro/Page";
import { writeLookHint } from "../../src/popup/themeHint";

const current = vi.hoisted(() => ({
	value: { isResolved: false, profile: undefined } as {
		isResolved: boolean;
		profile: unknown;
	},
}));
vi.mock("../../src/popup/hooks/useCurrentUserProfile", () => ({
	useResolvedCurrentUser: () => current.value,
	useCurrentUserProfile: () => current.value.profile,
}));

let root: Root | null = null;
let container: HTMLDivElement;

afterEach(() => {
	act(() => root?.unmount());
	container.remove();
	localStorage.clear();
	current.value = { isResolved: false, profile: undefined };
});

const render = async (ui: React.ReactNode) => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () => root!.render(ui));
};

const ShowTheme = () => <output>{useContext(ThemeContext)?.theme}</output>;

describe("the first paint", () => {
	// The profile's preference is only known once its row has loaded; a
	// dark profile used to paint white until then.
	it("uses the theme last shown until the profile is known", async () => {
		writeLookHint({
			theme: "little-dark" as never,
			accent: "mono",
			accentColor: null,
		});
		await render(
			<ThemeContextProvider>
				<ShowTheme />
			</ThemeContextProvider>,
		);
		expect(container.textContent).toBe("little-dark");

		current.value = { isResolved: true, profile: undefined };
		await act(async () =>
			root!.render(
				<ThemeContextProvider>
					<ShowTheme />
				</ThemeContextProvider>,
			),
		);
		// No profile unlocked: the light screens.
		expect(container.textContent).toBe("little-light");
	});

	it("shows no intro before the session is known, nor for an unlocked profile", async () => {
		await render(
			<MemoryRouter>
				<LUIIntro />
			</MemoryRouter>,
		);
		expect(container.textContent).not.toContain("Skip intro");

		current.value = { isResolved: true, profile: { id: "p1" } };
		await act(async () =>
			root!.render(
				<MemoryRouter>
					<LUIIntro />
				</MemoryRouter>,
			),
		);
		expect(container.textContent).not.toContain("Skip intro");
	});

	it("shows the intro when no profile is unlocked", async () => {
		current.value = { isResolved: true, profile: undefined };
		await render(
			<MemoryRouter>
				<LUIIntro />
			</MemoryRouter>,
		);
		expect(container.textContent).toContain("Skip intro");
	});
});
