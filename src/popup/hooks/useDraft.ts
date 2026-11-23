import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { UIStateContext } from "../contexts/UIStateContext";

// State that survives the popup closing. It starts from what was
// remembered under `key`, or from `initial`, and every change is
// remembered. Call `clear` once the work is saved, so the next visit
// starts fresh. Never use it for a password.
const useDraft = <T>(
	key: string,
	initial: T | (() => T),
): [T, (next: T | ((current: T) => T)) => void, () => void] => {
	const store = useContext(UIStateContext);
	const [value, setValue] = useState<T>(() => {
		const remembered = store.getDraft(key);
		if (remembered !== undefined) {
			return remembered as T;
		}
		return typeof initial === "function" ? (initial as () => T)() : initial;
	});
	const latest = useRef(value);
	useEffect(() => {
		latest.current = value;
	});

	const set = useCallback(
		(next: T | ((current: T) => T)) => {
			const resolved =
				typeof next === "function"
					? (next as (current: T) => T)(latest.current)
					: next;
			latest.current = resolved;
			setValue(resolved);
			store.setDraft(key, resolved);
		},
		[key, store],
	);

	const clear = useCallback(() => store.clearDraft(key), [key, store]);

	return [value, set, clear];
};

export { useDraft };
