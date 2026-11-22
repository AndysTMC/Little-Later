import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LUISettingsLayout } from "../../src/popup/components/LUISettingsLayout/Component";
import { LUIEmptyState } from "../../src/popup/components/LUIEmptyState/Component";

vi.mock("../../src/popup/hooks/useTheme", () => ({
	useTheme: () => ({ theme: "little-light" }),
}));

let root: Root;
let container: HTMLDivElement;

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = async (ui: React.ReactNode) => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () => root.render(ui));
	return container;
};

// Screen readers move between headings and announce a page by its first.
describe("page headings", () => {
	it("gives a settings page its name as the page heading", async () => {
		const view = await render(
			<LUISettingsLayout pageName="Settings">
				<p>Body</p>
			</LUISettingsLayout>,
		);
		expect(view.querySelector("h1")?.textContent).toBe("Settings");
	});

	it("gives an empty list a heading", async () => {
		const view = await render(<LUIEmptyState title="No tasks yet" />);
		expect(view.querySelector("h2")?.textContent).toBe("No tasks yet");
	});
});
