import type { Transition, Variants } from "framer-motion";

// Shared easing curves and durations across Little Later and Little AI
// (docs/design.md, Focus & motion).
// - Quint-out deceleration on enter feels immediate yet smoothly settled.
// - Slightly brisker exit keeps AnimatePresence `mode="wait"` screen swaps
//   responsive (~280ms total instead of 600ms) with zero sluggish lag.
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const EASE_EXIT = [0.4, 0, 1, 1] as const;

export const PAGE_ENTER_DURATION = 0.17;
export const PAGE_EXIT_DURATION = 0.11;

/** Consistent motion presets shared by views, drawers, popovers, and toasts. */
export const MOTION = {
	tab: { duration: 0.14, ease: EASE_OUT } satisfies Transition,
	tabExit: { duration: 0.09, ease: EASE_EXIT } satisfies Transition,
	drawer: { duration: 0.16, ease: EASE_OUT } satisfies Transition,
	popover: { duration: 0.13, ease: EASE_OUT } satisfies Transition,
	popoverExit: { duration: 0.09, ease: EASE_EXIT } satisfies Transition,
	toastEnter: { duration: 0.18, ease: EASE_OUT } satisfies Transition,
	toastExit: { duration: 0.13, ease: EASE_EXIT } satisfies Transition,
	reveal: { duration: 0.14, ease: EASE_OUT } satisfies Transition,
	sheet: { duration: 0.16, ease: EASE_OUT } satisfies Transition,
	sheetExit: { duration: 0.11, ease: EASE_EXIT } satisfies Transition,
} as const;

// A page transition is one move, carried by the navigation that causes it
// (`state.move`). The arriving page starts where the move says and settles
// in place; the leaving page goes where the same move says. AnimatePresence
// hands the move to the leaving page, so the two always agree.
//
// - forward / back: deeper into a section and out again (slides).
// - into / outOf: into a profile or a space such as Little AI, and out of
//   it again (subtle zooms).
// - rise / sink: a Home panel opening over the list, and closing.
// - none: no animation, for redirects and restored pages.
export type Move =
	"none" | "forward" | "back" | "into" | "outOf" | "rise" | "sink";

type Frame = { opacity?: number; x?: number; y?: number; scale?: number };

export const MOVES: Record<Move, { from: Frame; to: Frame }> = {
	none: { from: {}, to: {} },
	forward: { from: { opacity: 0, x: 24 }, to: { opacity: 0, x: -24 } },
	back: { from: { opacity: 0, x: -24 }, to: { opacity: 0, x: 24 } },
	into: {
		from: { opacity: 0, scale: 0.96 },
		to: { opacity: 0, scale: 1.04 },
	},
	outOf: {
		from: { opacity: 0, scale: 1.04 },
		to: { opacity: 0, scale: 0.96 },
	},
	rise: { from: { opacity: 0, y: 24 }, to: { opacity: 0, y: -24 } },
	sink: { from: { opacity: 0, y: -24 }, to: { opacity: 0, y: 24 } },
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

const enterTiming = (move: Move): Transition =>
	move === "none"
		? { duration: 0 }
		: { duration: PAGE_ENTER_DURATION, ease: EASE_OUT };

const exitTiming = (move: Move): Transition =>
	move === "none"
		? { duration: 0 }
		: { duration: PAGE_EXIT_DURATION, ease: EASE_EXIT };

export const pageVariants: Variants = {
	initial: (move: Move) => MOVES[move].from,
	animate: (move: Move) => ({
		opacity: 1,
		x: 0,
		y: 0,
		scale: 1,
		transition: enterTiming(move),
	}),
	exit: (move: Move) => ({ ...MOVES[move].to, transition: exitTiming(move) }),
};

export const isMove = (value: unknown): value is Move =>
	typeof value === "string" && Object.hasOwn(MOVES, value);

export const readMove = (state: unknown): Move => {
	const move = (state as { move?: unknown } | null)?.move;
	return isMove(move) ? move : "none";
};
