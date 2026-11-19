import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { UIStateContext } from "../contexts/UIStateContext";

// A stored setting being edited. The edit is remembered the moment it is
// made, so the popup closing before it is saved (a click elsewhere is
// enough) does not lose it: on the next opening the edit is still there
// and is saved then. Once the stored value catches up, the draft goes.
const useSettingDraft = <T>(
	key: string,
	stored: T | undefined,
	isSame: (a: T, b: T) => boolean = Object.is,
): [
	T | undefined,
	// An updater may return undefined to leave the value as it is.
	(next: T | ((current: T | undefined) => T | undefined)) => void,
] => {
	const { getDraft, setDraft, clearDraft } = useContext(UIStateContext);
	const [draft, setDraftState] = useState<T | undefined>(
		() => getDraft(key) as T | undefined,
	);
	const value = draft !== undefined ? draft : stored;
	const latest = useRef(value);
	useEffect(() => {
		latest.current = value;
	});

	const set = useCallback(
		(next: T | ((current: T | undefined) => T | undefined)) => {
			const resolved =
				typeof next === "function"
					? (next as (current: T | undefined) => T | undefined)(
							latest.current,
						)
					: next;
			if (resolved === undefined) {
				return;
			}
			latest.current = resolved;
			setDraftState(resolved);
			setDraft(key, resolved);
		},
		[key, setDraft],
	);

	useEffect(() => {
		if (
			draft !== undefined &&
			stored !== undefined &&
			isSame(draft, stored)
		) {
			setDraftState(undefined);
			clearDraft(key);
		}
	}, [draft, stored, isSame, key, clearDraft]);

	return [value, set];
};

export { useSettingDraft };
