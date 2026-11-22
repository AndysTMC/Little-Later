import { useEffect, useRef, useState } from "react";
import { attempt } from "../attempt";

// A delete takes two presses: the first arms the control, which changes
// its label, and the second, within a few seconds, runs the action. A
// stray click can no longer destroy a record.
const useConfirm = (
	action: () => Promise<unknown> | void,
	failureMessage?: string,
	timeoutMs = 4_000,
) => {
	const [armed, setArmed] = useState(false);
	const timer = useRef<number | undefined>(undefined);
	useEffect(() => () => window.clearTimeout(timer.current), []);

	const press = async () => {
		window.clearTimeout(timer.current);
		if (!armed) {
			setArmed(true);
			timer.current = window.setTimeout(() => setArmed(false), timeoutMs);
			return;
		}
		setArmed(false);
		await attempt(action, failureMessage);
	};

	return { armed, press };
};

export { useConfirm };
