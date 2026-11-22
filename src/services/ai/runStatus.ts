// What LittleAI is doing in each chat while a run is active (decision 0017,
// runs.ts). The worker writes it; the side panel reads it to show progress
// and Stop. A chat with no status is idle. In the extension it lives in
// session storage, one key per chat; elsewhere (tests, the dev server) in
// memory.

// A run refused: busy, expired, nothing to confirm. Shown to the user.
export class RunError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RunError";
	}
}

export type RunStatus = {
	// What the run is doing now: "Thinking", "Searching your notes", ...
	stage: string;
	// What it has done so far, in order: "Searched notes", ...
	steps: Array<string>;
	// The answer so far, while the provider streams it.
	draft?: string;
	startedAt: number;
};

type Listener = (chatId: string, status: RunStatus | null) => void;

export type RunStatusStore = {
	get: (chatId: string) => Promise<RunStatus | null>;
	set: (chatId: string, status: RunStatus | null) => Promise<void>;
	// Forgets every run (except any already active in this worker),
	// returning what each was doing: at worker start, none can still be
	// running.
	takeAll: (
		skip?: ReadonlySet<string>,
	) => Promise<Array<[string, RunStatus]>>;
	subscribe: (listener: Listener) => () => void;
};

export const RUN_STATUS_PREFIX = "ai:run:";

export const createMemoryRunStatusStore = (): RunStatusStore => {
	const statuses = new Map<string, RunStatus>();
	const listeners = new Set<Listener>();
	return {
		get: async (chatId) => statuses.get(chatId) ?? null,
		set: async (chatId, status) => {
			if (status) statuses.set(chatId, status);
			else statuses.delete(chatId);
			listeners.forEach((listener) => listener(chatId, status));
		},
		takeAll: async (skip) => {
			const taken = [...statuses.entries()].filter(
				([chatId]) => !skip?.has(chatId),
			);
			for (const [chatId] of taken) {
				statuses.delete(chatId);
				listeners.forEach((listener) => listener(chatId, null));
			}
			return taken;
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
};

export const createChromeRunStatusStore = (): RunStatusStore => ({
	get: async (chatId) => {
		const key = RUN_STATUS_PREFIX + chatId;
		return (
			((await chrome.storage.session.get(key))[key] as
				RunStatus | undefined) ?? null
		);
	},
	set: async (chatId, status) => {
		const key = RUN_STATUS_PREFIX + chatId;
		if (status) await chrome.storage.session.set({ [key]: status });
		else await chrome.storage.session.remove(key);
	},
	takeAll: async (skip) => {
		const keys = (await chrome.storage.session.getKeys()).filter(
			(key) =>
				key.startsWith(RUN_STATUS_PREFIX) &&
				!skip?.has(key.slice(RUN_STATUS_PREFIX.length)),
		);
		if (keys.length === 0) return [];
		const statuses = await chrome.storage.session.get(keys);
		await chrome.storage.session.remove(keys);
		return keys.map((key) => [
			key.slice(RUN_STATUS_PREFIX.length),
			statuses[key] as RunStatus,
		]);
	},
	subscribe: (listener) => {
		const onChanged = (changes: {
			[key: string]: chrome.storage.StorageChange;
		}) => {
			for (const [key, change] of Object.entries(changes)) {
				if (key.startsWith(RUN_STATUS_PREFIX)) {
					listener(
						key.slice(RUN_STATUS_PREFIX.length),
						(change.newValue as RunStatus | undefined) ?? null,
					);
				}
			}
		};
		chrome.storage.session.onChanged.addListener(onChanged);
		return () => chrome.storage.session.onChanged.removeListener(onChanged);
	},
});

export const runStatusStore: RunStatusStore =
	import.meta.env.MODE === "production"
		? createChromeRunStatusStore()
		: createMemoryRunStatusStore();
