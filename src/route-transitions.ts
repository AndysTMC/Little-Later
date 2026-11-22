import type { Variants } from "framer-motion";

// A page transition is one move, carried by the navigation that causes it
// (`state.move`). The arriving page starts where the move says and settles
// in place; the leaving page goes where the same move says. AnimatePresence
// hands the move to the leaving page, so the two always agree.
//
// - forward / back: deeper into a section and out again (slides).
// - into / outOf: into a profile or a space such as AI Assist, and out of
//   it again (zooms).
// - rise / sink: a Home panel opening over the list, and closing.
// - none: no animation, for redirects and restored pages.
export type Move =
	"none" | "forward" | "back" | "into" | "outOf" | "rise" | "sink";

type Frame = { opacity?: number; x?: number; y?: number; scale?: number };

export const MOVES: Record<Move, { from: Frame; to: Frame }> = {
	none: { from: {}, to: {} },
	forward: { from: { opacity: 0, x: 100 }, to: { opacity: 0, x: -100 } },
	back: { from: { opacity: 0, x: -100 }, to: { opacity: 0, x: 100 } },
	into: { from: { opacity: 0, scale: 0.9 }, to: { opacity: 0, scale: 1.1 } },
	outOf: {
		from: { opacity: 0, scale: 1.1 },
		to: { opacity: 0, scale: 0.9 },
	},
	rise: { from: { opacity: 0, y: 100 }, to: { opacity: 0, y: -100 } },
	sink: { from: { opacity: 0, y: -100 }, to: { opacity: 0, y: 100 } },
};

// The move that undoes each one.
export const REVERSE: Record<Move, Move> = {
	none: "none",
	forward: "back",
	back: "forward",
	into: "outOf",
	outOf: "into",
	rise: "sink",
	sink: "rise",
};

const DURATION = 0.3;

const timing = (move: Move) => ({
	duration: move === "none" ? 0 : DURATION,
});

export const pageVariants: Variants = {
	initial: (move: Move) => MOVES[move].from,
	animate: (move: Move) => ({
		opacity: 1,
		x: 0,
		y: 0,
		scale: 1,
		transition: timing(move),
	}),
	exit: (move: Move) => ({ ...MOVES[move].to, transition: timing(move) }),
};

export const isMove = (value: unknown): value is Move =>
	typeof value === "string" && Object.hasOwn(MOVES, value);

export const readMove = (state: unknown): Move => {
	const move = (state as { move?: unknown } | null)?.move;
	return isMove(move) ? move : "none";
};
