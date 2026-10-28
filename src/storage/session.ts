// The unlocked profile's key bytes (decision 0010, Unlocking). In the
// extension they live in chrome.storage.session: memory only, cleared on
// browser restart and extension update, and readable only by trusted
// contexts at its default access level, which this code never changes.
// Outside production there is no extension, so they live in memory.

const SESSION_KEY = "unlocked";

export type UnlockedSession = {
	profileId: string;
	currentKeyId: number;
	// Root keys by key id, base64.
	rootKeys: Record<string, string>;
	// Index key, base64.
	indexKey: string;
};

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

export const createChromeSessionStore = (): SessionStore => ({
	get: async () => {
		const result = await chrome.storage.session.get(SESSION_KEY);
		return (result[SESSION_KEY] as UnlockedSession | undefined) ?? null;
	},
	set: (session) => chrome.storage.session.set({ [SESSION_KEY]: session }),
	clear: () => chrome.storage.session.remove(SESSION_KEY),
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

export const sessionStore: SessionStore =
	import.meta.env.MODE === "production"
		? createChromeSessionStore()
		: createMemorySessionStore();

export const toBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
};

export const fromBase64 = (text: string): Uint8Array =>
	Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
