import { useEffect, useRef } from "react";
import { attempt } from "../attempt";

// Saves a little after the user stops changing something. `save` is null
// while there is nothing to save. A save still waiting when the page is
// left runs then, instead of being dropped: leaving a settings page right
// after an edit used to lose the edit.
//
// The wait restarts when `value`, what is being saved, changes, not on
// every render: callers pass a new `save` each render, and a background
// update re-rendering the page kept pushing the save back.
const useDebouncedSave = (
	save: (() => Promise<unknown>) | null,
	delayMs: number,
	value: unknown,
) => {
	const pending = useRef<(() => Promise<unknown>) | null>(null);
	const latest = useRef(save);
	useEffect(() => {
		latest.current = save;
		pending.current &&= save;
	});

	const key = save === null ? null : JSON.stringify(value);
	useEffect(() => {
		pending.current = latest.current;
		if (key === null) return;
		const timer = setTimeout(() => {
			const last = latest.current;
			pending.current = null;
			if (last) void attempt(last, "Couldn't save your changes.");
		}, delayMs);
		return () => clearTimeout(timer);
	}, [key, delayMs]);

	useEffect(() => {
		const flush = () => {
			const last = pending.current;
			pending.current = null;
			if (last) {
				void attempt(last, "Couldn't save your changes.");
			}
		};
		// The popup closing does not unmount anything; the page just goes.
		window.addEventListener("pagehide", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			flush();
		};
	}, []);
};

export { useDebouncedSave };
