// What the popup remembers between openings: the page it was on and what
// had been typed but not yet saved. Chrome closes the popup whenever it
// loses focus (a click elsewhere, a system dialog), so without this every
// interruption sent the user back to Home with an empty form.
//
// It lives where the unlocked profile's keys live, chrome.storage.session:
// in memory only, gone when the browser closes, and removed when the
// profile locks (src/storage/session.ts), so no draft outlives the session
// that wrote it. Outside production there is no extension, so the tab's
// sessionStorage stands in, as it does for the session itself.

import { stagedFilesInUse } from "./filePick";

// Each piece is its own key, so a page writes only what it changed: the
// popup and an extension tab open at once (the file picker, say) used to
// write their whole copy back and wipe out each other's drafts.
export const UI_STATE_PREFIX = "ui:";
export const ROUTE_KEY = `${UI_STATE_PREFIX}route`;
const DRAFT_PREFIX = `${UI_STATE_PREFIX}draft:`;
export const draftStorageKey = (key: string): string => DRAFT_PREFIX + key;

// A page is reopened only if it was left this recently; after that the
// popup starts from Home again. Drafts are kept either way.
export const ROUTE_MAX_AGE_MS = 30 * 60_000;

export type UIState = {
	route: { path: string; at: number } | null;
	drafts: Record<string, unknown>;
};

type Route = UIState["route"];

const empty = (): UIState => ({ route: null, drafts: {} });

const isProduction = import.meta.env.MODE === "production";

const parseRoute = (value: unknown): Route => {
	if (typeof value !== "object" || value === null) return null;
	const { path, at } = value as { path?: unknown; at?: unknown };
	return typeof path === "string" && typeof at === "number"
		? { path, at }
		: null;
};

// Applies one stored key to a page's copy; `undefined` means it was removed.
export const applyStored = (
	state: UIState,
	key: string,
	value: unknown,
): void => {
	if (key === ROUTE_KEY) {
		state.route = parseRoute(value);
	} else if (key.startsWith(DRAFT_PREFIX)) {
		const draft = key.slice(DRAFT_PREFIX.length);
		if (value === undefined) {
			delete state.drafts[draft];
		} else {
			state.drafts[draft] = value;
		}
	}
};

const assemble = (entries: Array<[string, unknown]>): UIState => {
	const state = empty();
	for (const [key, value] of entries) applyStored(state, key, value);
	return state;
};

const webKeys = (): Array<string> =>
	Array.from({ length: sessionStorage.length }, (_, index) =>
		sessionStorage.key(index),
	).filter((key): key is string => key?.startsWith(UI_STATE_PREFIX) ?? false);

const storedKeys = async (): Promise<Array<string>> =>
	isProduction
		? (await chrome.storage.session.getKeys()).filter((key) =>
				key.startsWith(UI_STATE_PREFIX),
			)
		: typeof sessionStorage === "undefined"
			? []
			: webKeys();

export const readUIState = async (): Promise<UIState> => {
	try {
		const keys = await storedKeys();
		if (isProduction) {
			if (keys.length === 0) return empty();
			return assemble(
				Object.entries(await chrome.storage.session.get(keys)),
			);
		}
		return assemble(
			keys.map((key) => [key, JSON.parse(sessionStorage.getItem(key)!)]),
		);
	} catch (error) {
		console.warn("Could not read the remembered state.", error);
		return empty();
	}
};

const warn = (error: unknown) => {
	console.warn("Could not remember the state.", error);
};

// Not awaited by callers: the popup can close at any moment, so each
// change is written at once rather than batched. `undefined` removes it.
export const writeStored = (key: string, value: unknown): void => {
	try {
		if (isProduction) {
			void (
				value === undefined
					? chrome.storage.session.remove(key)
					: chrome.storage.session.set({ [key]: value })
			).catch(warn);
			return;
		}
		if (typeof sessionStorage === "undefined") return;
		if (value === undefined) {
			sessionStorage.removeItem(key);
		} else {
			sessionStorage.setItem(key, JSON.stringify(value));
		}
	} catch (error) {
		warn(error);
	}
};

// Removes every draft under a prefix, including ones another page wrote
// that this page has not heard about yet.
export const removeStoredDrafts = (prefix: string): void => {
	const matches = (key: string) => key.startsWith(DRAFT_PREFIX + prefix);
	void storedKeys()
		.then((keys) => {
			for (const key of keys.filter(matches)) writeStored(key, undefined);
		})
		.catch(warn);
};

// Tells a page what other pages changed, so its copy stays current. The
// development stand-in is one tab's sessionStorage, which no other page
// shares.
export const subscribeUIState = (
	listener: (key: string, value: unknown) => void,
): (() => void) => {
	if (!isProduction) return () => undefined;
	const onChanged = (changes: {
		[key: string]: chrome.storage.StorageChange;
	}) => {
		for (const [key, change] of Object.entries(changes)) {
			if (key.startsWith(UI_STATE_PREFIX)) listener(key, change.newValue);
		}
	};
	chrome.storage.session.onChanged.addListener(onChanged);
	return () => chrome.storage.session.onChanged.removeListener(onChanged);
};

// Pages that are never reopened: the intro, and the screens that ask for a
// password, which must be reached on purpose.
const FORGOTTEN = [/^\/$/, /^\/unlock\//, /^\/lock$/, /^\/browse-profiles$/];

export const isRememberedRoute = (path: string): boolean =>
	!FORGOTTEN.some((pattern) => pattern.test(path));

export const routeToRestore = (state: UIState, now: number): string | null =>
	state.route &&
	isRememberedRoute(state.route.path) &&
	now - state.route.at <= ROUTE_MAX_AGE_MS
		? state.route.path
		: null;

// Staged files the remembered state still holds, which the worker's sweep
// of leftover staged files must keep (src/storage/staging.ts).
export const rememberedStagedFiles = async (): Promise<Set<string>> =>
	stagedFilesInUse((await readUIState()).drafts);
