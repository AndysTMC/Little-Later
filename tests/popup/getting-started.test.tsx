import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// The illustration strip scrolls itself in a loop. It must stay still for
// anyone who asked for less motion, and anyone else must be able to stop it.

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("framer-motion", async (original) => ({
	...(await original<typeof import("framer-motion")>()),
	useReducedMotion: () => motion.reduce,
}));
vi.mock("../../src/popup/hooks/useTheme", () => ({
	useTheme: () => ({ theme: "little-light", toggleTheme: () => {} }),
}));
vi.mock("../../src/popup/hooks/usePageMove", () => ({
	useMoveNavigate: () => () => {},
	usePageMotion: () => ({}),
}));
vi.mock("../../src/services/settings", () => ({
	markGettingStarted: async () => {},
}));

const { LUIGettingStarted } =
	await import("../../src/popup/pages/LUIGettingStarted/Page");

let root: Root;
let container: HTMLDivElement;

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

const frames = (count: number) =>
	act(async () => {
		for (let index = 0; index < count; index += 1) {
			await new Promise((resolve) => requestAnimationFrame(resolve));
		}
	});

// Steps to the first strip of illustrations, and returns it.
const openStrip = async () => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () =>
		root.render(
			<MemoryRouter>
				<LUIGettingStarted />
			</MemoryRouter>,
		),
	);
	const next = [...container.querySelectorAll("button")].find(
		(button) => button.textContent === "Next",
	)!;
	for (let step = 0; step < 3; step += 1) {
		await act(async () => next.click());
		await vi.waitFor(() =>
			expect(container.textContent).toContain("Visual Bookmarks"),
		);
	}
	await vi.waitFor(() =>
		expect(container.querySelector("img[alt^='Keep']")).not.toBeNull(),
	);
	const image = container.querySelector("img[alt^='Keep']")!;
	return image.closest<HTMLElement>(".shrink-0.w-full")!;
};

const offset = (strip: HTMLElement) => strip.style.transform;

describe("the Getting Started illustrations", () => {
	it("stay still, shown once, when less motion is asked for", async () => {
		motion.reduce = true;
		const strip = await openStrip();
		await frames(5);
		expect(offset(strip)).not.toContain("translateX");
		expect(strip.querySelectorAll("img")).toHaveLength(3);
		expect(
			container.querySelector("[aria-label='Pause the illustrations']"),
		).toBeNull();
	});

	it("move otherwise, and stop when paused", async () => {
		motion.reduce = false;
		const strip = await openStrip();
		await frames(5);
		expect(offset(strip)).toContain("translateX");

		const pause = container.querySelector<HTMLButtonElement>(
			"[aria-label='Pause the illustrations']",
		)!;
		await act(async () => pause.click());
		const stopped = offset(strip);
		await frames(5);
		expect(offset(strip)).toBe(stopped);
		expect(
			container.querySelector("[aria-label='Play the illustrations']"),
		).not.toBeNull();
	});
});
