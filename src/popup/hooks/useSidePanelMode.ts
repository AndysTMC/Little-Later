import { useEffect, useState } from "react";
import {
	DEFAULT_SIDE_PANEL_MODE,
	getSidePanelMode,
	subscribeSidePanelMode,
	type SidePanelMode,
} from "../../services/sidePanel";

export const useSidePanelMode = (): SidePanelMode => {
	const [mode, setMode] = useState<SidePanelMode>(DEFAULT_SIDE_PANEL_MODE);

	useEffect(() => {
		let cancelled = false;
		void getSidePanelMode().then((stored) => {
			if (!cancelled) setMode(stored);
		});
		const unsubscribe = subscribeSidePanelMode((next) => {
			if (!cancelled) setMode(next);
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	return mode;
};
