// The unlocked profile's key bytes (decision 0010, Unlocking). In the
// extension they live in chrome.storage.session: memory only, cleared on
// browser restart and extension update, and readable only by trusted
// contexts at its default access level, which this code never changes.
// Outside production there is no extension, so they live in memory.

const SESSION_KEY = "unlocked";
// What the popup remembers between openings (src/popup/uiState.ts): the
// page it was on and unsaved drafts. It is a profile's content, so it goes
// when the profile locks, and when another profile's session replaces it:
// otherwise one profile's drafts reopened in the next profile's forms.
// Each piece is its own "ui:" key; "ui" alone is the single key it used to
// be, removed with them.
const isUIStateKey = (key: string) => key === "ui" || key.startsWith("ui:");

export type UnlockedSession = {
	profileId: string;
	currentKeyId: number;
	// Root keys by key id, base64.
	rootKeys: Record<string, string>;
	// Index key, base64.
	indexKey: string;
	// New on every unlock. Work bound to one unlock, such as an AI request,
	// ends when the profile locks, even if the same profile is opened again
	// before the work finishes (src/services/ai/owner.ts).
	unlockId: string;
};

// The key material of a session, without what identifies the unlock.
export type SessionKeys = Omit<UnlockedSession, "unlockId">;

type Listener = (session: UnlockedSession | null) => void;

export type SessionStore = {
	get: () => Promise<UnlockedSession | null>;
	set: (session: UnlockedSession) => Promise<void>;
	clear: () => Promise<void>;
	// Fires in every context when the session changes, including on lock.
	subscribe: (listener: Listener) => () => void;
};

export const createMemorySessionStore = (): SessionStore => {
	let current: UnlockedSession | null = null;
	const listeners = new Set<Listener>();
	const emit = () => listeners.forEach((listener) => listener(current));
	return {
		get: async () => current,
		set: async (session) => {
			current = session;
			emit();
		},
		clear: async () => {
			current = null;
			emit();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
};

const chromeUIStateKeys = async () =>
	(await chrome.storage.session.getKeys()).filter(isUIStateKey);

export const createChromeSessionStore = (): SessionStore => ({
	get: async () => {
		const result = await chrome.storage.session.get(SESSION_KEY);
		return (result[SESSION_KEY] as UnlockedSession | undefined) ?? null;
	},
	set: async (session) => {
		const previous = (await chrome.storage.session.get(SESSION_KEY))[
			SESSION_KEY
		] as UnlockedSession | undefined;
		if (previous?.profileId !== session.profileId) {
			await chrome.storage.session.remove(await chromeUIStateKeys());
		}
		await chrome.storage.session.set({ [SESSION_KEY]: session });
	},
	clear: async () =>
		chrome.storage.session.remove([
			SESSION_KEY,
			...(await chromeUIStateKeys()),
		]),
	subscribe: (listener) => {
		const onChanged = (changes: {
			[key: string]: chrome.storage.StorageChange;
		}) => {
			if (SESSION_KEY in changes) {
				listener(
					(changes[SESSION_KEY].newValue as
						UnlockedSession | undefined) ?? null,
				);
			}
		};
		chrome.storage.session.onChanged.addListener(onChanged);
		return () => chrome.storage.session.onChanged.removeListener(onChanged);
	},
});

// Development pages have no worker and reload often, so the session lives
// in the tab's sessionStorage there, which like chrome.storage.session ends
// with the browsing session.
export const createWebSessionStore = (storage: Storage): SessionStore => {
	const listeners = new Set<Listener>();
	const read = () => {
		const text = storage.getItem(SESSION_KEY);
		return text === null ? null : (JSON.parse(text) as UnlockedSession);
	};
	const removeUIState = () => {
		const keys = Array.from({ length: storage.length }, (_, index) =>
			storage.key(index),
		).filter((key): key is string => key !== null && isUIStateKey(key));
		for (const key of keys) storage.removeItem(key);
	};
	const emit = () => {
		const current = read();
		listeners.forEach((listener) => listener(current));
	};
	return {
		get: async () => read(),
		set: async (session) => {
			if (read()?.profileId !== session.profileId) {
				removeUIState();
			}
			storage.setItem(SESSION_KEY, JSON.stringify(session));
			emit();
		},
		clear: async () => {
			storage.removeItem(SESSION_KEY);
			removeUIState();
			emit();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
};

export const sessionStore: SessionStore =
	import.meta.env.MODE === "production"
		? createChromeSessionStore()
		: typeof sessionStorage === "undefined"
			? createMemorySessionStore()
			: createWebSessionStore(sessionStorage);

export const toBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
};

export const fromBase64 = (text: string): Uint8Array =>
	Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
