import { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { type Move, pageVariants, readMove } from "../../route-transitions";

// Motion props for a page or a Home panel. The entry comes from the move
// this page was opened with; the exit from the move that replaces it,
// which AnimatePresence passes in as `custom`.
export const usePageMotion = () => {
	const location = useLocation();
	const [move] = useState(() => readMove(location.state));
	return {
		variants: pageVariants,
		custom: move,
		initial: "initial",
		animate: "animate",
		exit: "exit",
	} as const;
};

export type MoveOptions = {
	replace?: boolean;
	state?: Record<string, unknown>;
};

// Navigates with one move, which animates both the page being left and the
// page being opened.
export const useMoveNavigate = () => {
	const navigate = useNavigate();
	return useCallback(
		(to: string, move: Move, options: MoveOptions = {}) =>
			navigate(to, {
				replace: options.replace,
				state: { ...options.state, move },
			}),
		[navigate],
	);
};
