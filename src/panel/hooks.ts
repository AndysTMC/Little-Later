import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { runStatusStore, type RunStatus } from "../services/ai/runStatus";
import type { ProfileKeys } from "../storage/keys";
import { littleDB } from "../storage/pageDB";
import {
	listChats,
	listLatestChatMessages,
	type Chat,
	type ChatMessage,
} from "../storage/repositories";

// What LittleAI's side panel reads (decision 0017). Chats and messages are
// live: the worker's runs add answers while the panel shows them.

export const useChats = (keys: ProfileKeys): Array<Chat> | undefined =>
	useLiveQuery(() => listChats(littleDB, keys), [keys]);

// A chat's latest `count` messages: a long chat opens without reading all
// of it, and earlier messages load when asked for. Tagged with chatId so
// switching chats never flashes the previous chat's messages or approval box.
export const useChatMessages = (
	keys: ProfileKeys,
	chatId: string | null,
	count: number,
): { messages: Array<ChatMessage>; hasEarlier: boolean } | undefined => {
	const result = useLiveQuery(
		async () =>
			chatId === null
				? {
						chatId: null,
						messages: [] as Array<ChatMessage>,
						hasEarlier: false,
					}
				: {
						chatId,
						...(await listLatestChatMessages(
							littleDB,
							keys,
							chatId,
							count,
						)),
					},
		[keys, chatId, count],
	);
	if (result?.chatId !== chatId) return undefined;
	return { messages: result.messages, hasEarlier: result.hasEarlier };
};

// What the chat's run is doing, or null while it is idle.
export const useRunStatus = (chatId: string | null): RunStatus | null => {
	const [status, setStatus] = useState<{
		chatId: string | null;
		status: RunStatus | null;
	}>({ chatId, status: null });
	useEffect(() => {
		if (chatId === null) return;
		let active = true;
		void runStatusStore.get(chatId).then((current) => {
			if (active) setStatus({ chatId, status: current });
		});
		const unsubscribe = runStatusStore.subscribe((changed, next) => {
			if (active && changed === chatId) {
				setStatus({ chatId, status: next });
			}
		});
		return () => {
			active = false;
			unsubscribe();
		};
	}, [chatId]);
	// A status read for another chat never shows for this one.
	return status.chatId === chatId ? status.status : null;
};

// The time, updated every `everyMs`: for what expires, such as Undo.
export const useNow = (everyMs = 15_000, enabled = true): number => {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!enabled) return;
		const timer = setInterval(() => setNow(Date.now()), everyMs);
		return () => clearInterval(timer);
	}, [everyMs, enabled]);
	return now;
};

export type WebTab = {
	tabId: number;
	title: string;
	url: string;
	favicon?: string;
};

const isWeb = (url: string | undefined) =>
	url !== undefined && /^https?:\/\//.test(url);

const sameTab = (a: WebTab | null, b: WebTab | null): boolean =>
	a === b ||
	(a !== null &&
		b !== null &&
		a.tabId === b.tabId &&
		a.url === b.url &&
		a.title === b.title &&
		a.favicon === b.favicon);

// The page "this page" means (decision 0017): the window's active tab when
// it's a web page; otherwise, as when LittleAI itself is open in a tab, the
// web page used last in a normal browser window. Follows tab switches and loads.
export const useActiveWebTab = (): WebTab | null => {
	const [tab, setTab] = useState<WebTab | null>(null);
	useEffect(() => {
		if (typeof chrome === "undefined" || !chrome.tabs?.query) return;
		let active = true;
		let seq = 0;
		const pickFrom = (tabs: Array<chrome.tabs.Tab>) => {
			const web = tabs.filter((candidate) => isWeb(candidate.url));
			return (
				web.find((candidate) => candidate.active) ??
				[...web].sort(
					(a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0),
				)[0]
			);
		};
		const refresh = async () => {
			const id = ++seq;
			const focusedTabs = await chrome.tabs.query({
				lastFocusedWindow: true,
			});
			let chosen = pickFrom(focusedTabs);
			if (!chosen) {
				// Focusing a popup/DevTools window shouldn't drop the chip.
				const normalTabs = await chrome.tabs.query({
					windowType: "normal",
				});
				chosen = pickFrom(normalTabs);
			}
			if (!active || id !== seq) return;
			const next: WebTab | null =
				chosen?.id !== undefined && chosen.url
					? {
							tabId: chosen.id,
							title: chosen.title || chosen.url,
							url: chosen.url,
							favicon: chosen.favIconUrl,
						}
					: null;
			setTab((prev) => (sameTab(prev, next) ? prev : next));
		};
		void refresh();
		const onChange = () => void refresh();
		chrome.tabs.onActivated.addListener(onChange);
		chrome.tabs.onUpdated.addListener(onChange);
		chrome.tabs.onRemoved.addListener(onChange);
		chrome.windows?.onFocusChanged.addListener(onChange);
		return () => {
			active = false;
			chrome.tabs.onActivated.removeListener(onChange);
			chrome.tabs.onUpdated.removeListener(onChange);
			chrome.tabs.onRemoved.removeListener(onChange);
			chrome.windows?.onFocusChanged.removeListener(onChange);
		};
	}, []);
	return tab;
};
