import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { sessionStore } from "../../storage/session";
import type { ContextProviderProps } from "../../types";
import {
	applyStored,
	draftStorageKey,
	isRememberedRoute,
	readUIState,
	removeStoredDrafts,
	ROUTE_KEY,
	routeToRestore,
	subscribeUIState,
	writeStored,
	type UIState,
} from "../uiState";
import { UIStateContext, type UIStateStore } from "./UIStateContext";

// Loads what the popup remembered before anything is drawn, reopens the
// page it was on, and hands the pages a store for their drafts.
const UIStateProvider: React.FC<ContextProviderProps> = ({ children }) => {
	const state = useRef<UIState | null>(null);
	const [isLoaded, setIsLoaded] = useState(false);
	const location = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		let active = true;
		void readUIState().then((loaded) => {
			if (!active) return;
			state.current = loaded;
			// Only a popup opened at its start page goes back to where it
			// was; one opened at a page on purpose stays there.
			const restore = routeToRestore(loaded, Date.now());
			if (
				restore !== null &&
				window.location.hash.replace(/^#/, "") in START
			) {
				navigate(restore, { replace: true });
			}
			setIsLoaded(true);
		});
		return () => {
			active = false;
		};
		// Once, when the popup opens.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Locking removes the remembered state from storage; this page's copy
	// goes with it, or its next write would put the drafts straight back.
	// A different profile unlocked here or in another context removes it
	// from storage too (src/storage/session.ts).
	const sessionProfile = useRef<string | null | undefined>(undefined);
	useEffect(() => {
		void sessionStore.get().then((session) => {
			sessionProfile.current ??= session?.profileId ?? null;
		});
		return sessionStore.subscribe((session) => {
			const next = session?.profileId ?? null;
			if (next !== sessionProfile.current && state.current) {
				state.current = { route: null, drafts: {} };
			}
			sessionProfile.current = next;
		});
	}, []);

	// What other pages change (the file picker's tab, a second popup) is
	// applied to this copy, so it never reads back a stale draft.
	useEffect(
		() =>
			subscribeUIState((key, value) => {
				if (state.current) applyStored(state.current, key, value);
			}),
		[],
	);

	const store = useMemo<UIStateStore>(() => {
		// Only the key that changed is written, never the whole copy.
		const change = (key: string, value: unknown) => {
			if (!state.current) return;
			applyStored(state.current, key, value);
			writeStored(key, value);
		};
		return {
			getDraft: (key) => state.current?.drafts[key],
			setDraft: (key, value) => change(draftStorageKey(key), value),
			clearDraft: (key) => change(draftStorageKey(key), undefined),
			clearDrafts: (prefix) => {
				if (!state.current) return;
				for (const key of Object.keys(state.current.drafts)) {
					if (key.startsWith(prefix))
						delete state.current.drafts[key];
				}
				removeStoredDrafts(prefix);
			},
			rememberRoute: (path) =>
				change(
					ROUTE_KEY,
					isRememberedRoute(path)
						? { path, at: Date.now() }
						: undefined,
				),
		};
	}, []);

	// As soon as the route changes, not after the next paint: a popup
	// closed right after a save used to reopen on the form it had left.
	const path = location.pathname + location.search;
	useLayoutEffect(() => {
		if (isLoaded) {
			store.rememberRoute(path);
		}
	}, [isLoaded, path, store]);

	if (!isLoaded) {
		return null;
	}
	return (
		<UIStateContext.Provider value={store}>
			{children}
		</UIStateContext.Provider>
	);
};

// The hash of a popup opened without a page in mind.
const START: Record<string, true> = { "": true, "/": true };

export { UIStateProvider };
