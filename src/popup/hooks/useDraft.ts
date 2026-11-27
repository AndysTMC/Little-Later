import {
	useCallback,
	useContext,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { UIStateContext } from "../contexts/UIStateContext";

/**
 * Persists transient UI draft state across popup close/reopen cycles under `key`.
 *
 * Call the returned `clear` helper once the draft is committed so subsequent
 * visits start fresh. Never store secrets or passwords in drafts.
 */
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
	useLayoutEffect(() => {
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
