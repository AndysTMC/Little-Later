import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/popup/hooks/useTheme", () => ({
	useTheme: () => ({ theme: "little-light" }),
}));
vi.mock("../../src/services/toasts", () => ({ createToast: async () => {} }));

const { LUIDeleteButton } =
	await import("../../src/popup/components/LUIDeleteButton/Component");

// The one way a list item is deleted (docs/design.md, Confirming): a
// "Delete" pill, armed red by the first press, deleting on the second.

let root: Root;
let container: HTMLDivElement;

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const render = async (onDelete: () => void, onOpen = vi.fn()) => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () =>
		root.render(
			// A card opens on a click; the delete must not open it.
			<div onClick={onOpen}>
				<LUIDeleteButton subject="note" onDelete={onDelete} />
			</div>,
		),
	);
	return container.querySelector("button")!;
};

describe("the delete control", () => {
	it("deletes only on the second press, red and labelled while armed", async () => {
		const onDelete = vi.fn();
		const onOpen = vi.fn();
		const button = await render(onDelete, onOpen);
		expect(button.textContent).toBe("Delete");
		expect(button.getAttribute("aria-label")).toBe("Delete note");
		expect(button.querySelector("svg")).toBeNull();

		await act(async () => button.click());
		expect(onDelete).not.toHaveBeenCalled();
		expect(button.textContent).toBe("Confirm delete");
		expect(button.getAttribute("aria-label")).toBe("Confirm delete note");
		expect(button.className).toContain("bg-red-600");

		await act(async () => button.click());
		expect(onDelete).toHaveBeenCalledTimes(1);
		expect(button.textContent).toBe("Delete");
		expect(onOpen).not.toHaveBeenCalled();
	});

	it("disarms itself after a few seconds", async () => {
		vi.useFakeTimers();
		try {
			const onDelete = vi.fn();
			const button = await render(onDelete);
			await act(async () => button.click());
			expect(button.textContent).toBe("Confirm delete");
			await act(async () => vi.advanceTimersByTime(4_100));
			expect(button.textContent).toBe("Delete");
			await act(async () => button.click());
			expect(onDelete).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
