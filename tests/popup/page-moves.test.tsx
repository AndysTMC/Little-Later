import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LUILink } from "../../src/popup/components/LUILink/Component";
import { LUIBasicNav } from "../../src/popup/components/LUINavs/LUIBasicNav/Component";
import {
	type Move,
	MOVES,
	REVERSE,
	pageVariants,
	readMove,
} from "../../src/route-transitions";

vi.mock("../../src/popup/hooks/useTheme", () => ({
	useTheme: () => ({ theme: "little-light" }),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
	act(() => root?.unmount());
	container?.remove();
	root = null;
	container = null;
});

// Shows where the router is, and the move it was sent with.
const Where = () => {
	const location = useLocation();
	return (
		<output data-testid="where">
			{location.pathname} {String(location.state?.move)}
		</output>
	);
};

const render = async (ui: React.ReactNode) => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () => root!.render(ui));
	return container;
};

describe("a record link outside Home", () => {
	// A task's own reminder links to its task from the reminder page, where
	// Home is not on screen.
	it("opens the linked record, moving forward", async () => {
		const view = await render(
			<MemoryRouter initialEntries={["/reminder/r1"]}>
				<Routes>
					<Route
						path="/reminder/:id"
						element={
							<LUILink
								content="Water the plants"
								navigateTo="/task/t1"
								hoverBackground=""
							/>
						}
					/>
					<Route path="/task/:id" element={<Where />} />
				</Routes>
			</MemoryRouter>,
		);
		const link = view.querySelector<HTMLElement>("[role='button']");
		expect(link).not.toBeNull();
		await act(async () => link!.click());
		expect(view.querySelector("[data-testid='where']")?.textContent).toBe(
			"/task/t1 forward",
		);
	});
});

const ALL = Object.keys(MOVES) as Array<Move>;

// Offset from rest along each axis: where a page is, relative to settled.
const offset = (frame: { x?: number; y?: number; scale?: number }) => ({
	x: frame.x ?? 0,
	y: frame.y ?? 0,
	scale: (frame.scale ?? 1) - 1,
});

describe("page moves", () => {
	// The leaving page and the arriving page share one move, so they travel
	// the same way: one leaves toward where the other came from the far side.
	it.each(ALL)("%s sends both pages the same way", (move) => {
		const from = offset(MOVES[move].from);
		const to = offset(MOVES[move].to);
		expect(to.x).toBe(-from.x || 0);
		expect(to.y).toBe(-from.y || 0);
		expect(to.scale).toBeCloseTo(-from.scale);
	});

	// Going back retraces the way in: the page that comes back starts where
	// it went when it left.
	it.each(ALL)("the reverse of %s retraces it", (move) => {
		expect(REVERSE[REVERSE[move]]).toBe(move);
		expect(MOVES[REVERSE[move]].from).toEqual(MOVES[move].to);
	});

	it("drives the leaving page's exit and the new page's entry", () => {
		const exit = pageVariants.exit as (move: Move) => object;
		const initial = pageVariants.initial as (move: Move) => object;
		expect(exit("outOf")).toMatchObject(MOVES.outOf.to);
		expect(initial("outOf")).toEqual(MOVES.outOf.from);
	});

	it("reads no move as none", () => {
		expect(readMove(undefined)).toBe("none");
		expect(readMove({ move: "sideways" })).toBe("none");
		expect(readMove({ move: "into" })).toBe("into");
	});
});

describe("the back button", () => {
	const backFrom = async (move?: Move) => {
		const view = await render(
			<MemoryRouter initialEntries={["/unlock/p1"]}>
				<Routes>
					<Route
						path="/unlock/:id"
						element={
							<LUIBasicNav
								navigateTo="/browse-profiles"
								move={move}
							/>
						}
					/>
					<Route path="/browse-profiles" element={<Where />} />
				</Routes>
			</MemoryRouter>,
		);
		const button = view.querySelector<HTMLElement>(
			"[aria-label='Go back']",
		);
		await act(async () => button!.click());
		return view.querySelector("[data-testid='where']")?.textContent;
	};

	// Unlock is zoomed into from the profile picker, so leaving zooms out.
	it("goes back with the reverse of the way the page was opened", async () => {
		expect(await backFrom(REVERSE.into)).toBe("/browse-profiles outOf");
	});

	it("slides back by default", async () => {
		expect(await backFrom()).toBe("/browse-profiles back");
	});
});
