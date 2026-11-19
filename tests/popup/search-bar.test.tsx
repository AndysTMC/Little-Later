import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LUISearchBar } from "../../src/popup/components/LUISearchBar/Component";

vi.mock("../../src/popup/hooks/useTheme", () => ({
	useTheme: () => ({ theme: "little-light" }),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.useRealTimers();
});

const render = async () => {
	const handleSearch = vi.fn(async () => {});
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () =>
		root.render(<LUISearchBar handleSearch={handleSearch} />),
	);
	const input = container.querySelector("input")!;
	return { handleSearch, input };
};

const type = async (input: HTMLInputElement, value: string) => {
	const setValue = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	await act(async () => {
		input.focus();
		setValue?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
};

const clearButtons = () =>
	container.querySelectorAll("button[aria-label='Clear search']");

describe("the search bar", () => {
	it("has one clear button, only while searching", async () => {
		const { input } = await render();
		expect(clearButtons()).toHaveLength(0);
		await act(async () => input.focus());
		expect(clearButtons()).toHaveLength(1);
	});

	// Typing then clearing within the search delay used to run the typed
	// search afterwards, bringing its results back under an empty box.
	it("clearing cancels a search still waiting to run", async () => {
		const { input, handleSearch } = await render();
		await type(input, "milk");
		await act(async () => (clearButtons()[0] as HTMLElement).click());
		await act(async () => vi.advanceTimersByTime(1000));
		expect(handleSearch).toHaveBeenLastCalledWith("");
		expect(handleSearch).not.toHaveBeenCalledWith("milk");
		expect(input.value).toBe("");
	});

	it("ends with Escape, like the clear button", async () => {
		const { input, handleSearch } = await render();
		await type(input, "milk");
		await act(async () =>
			input.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
			),
		);
		await act(async () => vi.advanceTimersByTime(1000));
		expect(handleSearch).not.toHaveBeenCalledWith("milk");
		expect(clearButtons()).toHaveLength(0);
	});

	it("ends when an empty box loses focus, and stays while it has text", async () => {
		const { input } = await render();
		await type(input, "milk");
		await act(async () => input.blur());
		expect(clearButtons()).toHaveLength(1);
		await type(input, "");
		await act(async () => input.blur());
		expect(clearButtons()).toHaveLength(0);
	});
});
