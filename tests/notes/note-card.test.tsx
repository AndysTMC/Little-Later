import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "../../src/storage/repositories";
import { LUINoteMini } from "../../src/popup/components/LUINoteMini/Component";

vi.mock("../../src/popup/hooks/useTheme", () => ({
	useTheme: () => ({ theme: "little-light" }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
	act(() => root?.unmount());
	container?.remove();
});

const card = async (content: string) => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	const note = { id: "n1", content, updatedAt: 0 } as Note;
	await act(async () =>
		root!.render(<LUINoteMini note={note} onOpen={() => {}} />),
	);
	return container;
};

const occurrences = (view: HTMLElement, text: string) =>
	Array.from(view.querySelectorAll("div, p")).filter(
		(element) =>
			element.children.length === 0 &&
			element.textContent?.trim() === text,
	).length;

describe("a note card", () => {
	it("shows a one-line note once, as its title", async () => {
		const view = await card("Buy milk");
		expect(occurrences(view, "Buy milk")).toBe(1);
	});

	it("shows the lines after the title underneath it", async () => {
		const view = await card("Groceries\nBuy milk");
		expect(occurrences(view, "Groceries")).toBe(1);
		expect(occurrences(view, "Buy milk")).toBe(1);
	});
});
