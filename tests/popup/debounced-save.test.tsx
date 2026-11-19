import { act, useReducer, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedSave } from "../../src/popup/hooks/useDebouncedSave";

let root: Root;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	act(() => root.unmount());
	vi.useRealTimers();
});

describe("a debounced save", () => {
	// A background update re-renders the page without changing what is
	// being saved; that used to push the save back each time.
	it("is not put off by renders that change nothing", async () => {
		const saved = vi.fn(async () => {});
		let rerender = () => {};
		const Page = () => {
			const [, force] = useReducer((n: number) => n + 1, 0);
			useEffect(() => {
				rerender = force;
			});
			useDebouncedSave(() => saved(), 500, "Ada");
			return null;
		};
		root = createRoot(document.createElement("div"));
		await act(async () => root.render(<Page />));
		for (let i = 0; i < 4; i++) {
			await act(async () => vi.advanceTimersByTime(200));
			await act(async () => rerender());
		}
		expect(saved).toHaveBeenCalledTimes(1);
	});

	it("waits again when the value changes", async () => {
		const saved = vi.fn<(name: string) => Promise<void>>(async () => {});
		const Page = ({ name }: { name: string }) => {
			useDebouncedSave(() => saved(name), 500, name);
			return null;
		};
		root = createRoot(document.createElement("div"));
		await act(async () => root.render(<Page name="A" />));
		await act(async () => vi.advanceTimersByTime(400));
		await act(async () => root.render(<Page name="Ad" />));
		await act(async () => vi.advanceTimersByTime(400));
		expect(saved).not.toHaveBeenCalled();
		await act(async () => vi.advanceTimersByTime(200));
		expect(saved).toHaveBeenCalledExactlyOnceWith("Ad");
	});
});
