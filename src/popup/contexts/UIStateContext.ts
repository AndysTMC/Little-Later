import { createContext } from "react";

// Drafts and the last page, as the pages use them. The default does
// nothing, so a component rendered on its own (a test) works unremembered.
export type UIStateStore = {
	getDraft: (key: string) => unknown;
	setDraft: (key: string, value: unknown) => void;
	clearDraft: (key: string) => void;
	// Clears every draft whose key starts with the prefix.
	clearDrafts: (prefix: string) => void;
	rememberRoute: (path: string) => void;
};

export const UIStateContext = createContext<UIStateStore>({
	getDraft: () => undefined,
	setDraft: () => {},
	clearDraft: () => {},
	clearDrafts: () => {},
	rememberRoute: () => {},
});
