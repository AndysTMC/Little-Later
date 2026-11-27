import { urlKeyFor } from "little-shared/utils/envelope";
import { getSettings, putPreview } from "../storage/repositories";
import { importProfileKeys } from "../storage/keys";
import type { LittleDB } from "../storage/schema";
import type { SessionStore } from "../storage/session";
import { isUrlIgnored } from "../utils/ignoredUrls";
import type { Dispatch, SerialQueue } from "./commands/registry";

// A page the user stays on is looked at again at most this often. Its
// visit is recorded once: rewriting the same record on every tick made
// every open popup re-read its lists for nothing. Its preview is replaced
// only when the page looks different, so an unchanged page costs a
// screenshot and nothing else.
export const PREVIEW_REFRESH_MS = 15_000;

export type CapturedTab = {
	id?: number;
	url?: string;
	title?: string;
	windowId?: number;
	incognito?: boolean;
};

// Only normal web pages can be screenshot reliably from the worker, and a
// private window is never recorded.
const webUrl = (tab: CapturedTab): string | null =>
	!tab.incognito &&
	tab.url &&
	/^https?:\/\//i.test(tab.url) &&
	tab.windowId !== undefined
		? tab.url
		: null;

// Records the pages the user visits, with a preview of each, and saves
// pages from the context menu. Nothing is captured while locked: the
// profile's key is needed to store anything (0010).
export const createPageCapture = ({
	db,
	session,
	queue,
	dispatch,
	now,
	screenshot,
	readSnapshot,
	isShowing = async () => true,
}: {
	db: LittleDB;
	session: SessionStore;
	queue: SerialQueue;
	dispatch: Dispatch;
	now: () => number;
	screenshot: (windowId: number) => Promise<Uint8Array | undefined>;
	readSnapshot?: (tab: CapturedTab) => Promise<string | undefined>;
	// Whether the tab is still the one its window shows, at the same page.
	// A screenshot is of whatever the window shows when it is taken, so a
	// tab switched to meanwhile would give this page another page's look.
	isShowing?: (tab: CapturedTab) => Promise<boolean>;
}) => {
	const screenshotOf = async (
		tab: CapturedTab,
	): Promise<Uint8Array | undefined> => {
		const bytes = await screenshot(tab.windowId!);
		return bytes && (await isShowing(tab)) ? bytes : undefined;
	};

	let last = { signature: "", at: -Infinity, look: "" };

	// Tells two screenshots apart without keeping either.
	const lookOf = async (bytes: Uint8Array | undefined): Promise<string> => {
		if (!bytes) {
			return "";
		}
		const digest = await crypto.subtle.digest(
			"SHA-256",
			bytes.slice().buffer,
		);
		return Array.from(new Uint8Array(digest), (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");
	};

	// Stores a preview behind the writes queued meanwhile: the profile may
	// have been locked or the page deleted since the screenshot.
	const storePreview = (
		profileId: string,
		bytes: Uint8Array,
		findSaveId: (
			keys: Awaited<ReturnType<typeof importProfileKeys>>,
		) => Promise<string | undefined>,
	): Promise<void> =>
		queue(async () => {
			const current = await session.get();
			if (current?.profileId !== profileId) {
				return;
			}
			const keys = await importProfileKeys(current);
			const saveId = await findSaveId(keys);
			if (saveId !== undefined) {
				await putPreview(db, keys, saveId, bytes, now());
			}
		});

	const capture = async (
		tab: CapturedTab,
		url: string,
		saved: boolean,
	): Promise<string | null> => {
		const unlocked = await session.get();
		if (!unlocked) {
			return null;
		}
		const bytes = await screenshotOf(tab);
		const snapshot =
			saved && readSnapshot
				? await readSnapshot(tab).catch(() => undefined)
				: undefined;
		// Another profile may have been opened during the screenshot; the
		// page belongs to the one that was browsing.
		const result = await dispatch(
			"save.capture",
			{
				url,
				title: tab.title?.trim() ?? "",
				saved,
				...(snapshot ? { snapshot } : {}),
			},
			{ profileId: unlocked.profileId },
		);
		if (!result.ok) {
			return null;
		}
		const { id } = result.value as { id: string };
		if (bytes) {
			await storePreview(unlocked.profileId, bytes, async () => id);
		}
		return lookOf(bytes);
	};

	// A newer preview for a page already recorded, if it looks different;
	// its record is untouched. Returns how the page looks now.
	const refreshPreview = async (
		tab: CapturedTab,
		url: string,
		previousLook: string,
	): Promise<string | null> => {
		const unlocked = await session.get();
		if (!unlocked) {
			return null;
		}
		const bytes = await screenshotOf(tab);
		if (!bytes) {
			return null;
		}
		const look = await lookOf(bytes);
		if (look === previousLook) {
			return look;
		}
		await storePreview(unlocked.profileId, bytes, async (keys) => {
			const row = await db.saves
				.where("[profileId+urlKey]")
				.equals([keys.profileId, await urlKeyFor(keys.index, url)])
				.first();
			return row?.id;
		});
		return look;
	};

	return {
		visit: async (tab: CapturedTab): Promise<void> => {
			const url = webUrl(tab);
			if (!url) {
				return;
			}
			const unlocked = await session.get();
			if (!unlocked) {
				return;
			}
			// Skip URLs/domains the user added to the history ignore list.
			try {
				const keys = await importProfileKeys(unlocked);
				const { misc } = await getSettings(db, keys);
				if (isUrlIgnored(url, misc.ignoredDomains)) {
					return;
				}
			} catch {
				// Fail closed: skip automatic capture if privacy settings
				// cannot be read.
				return;
			}
			// The page is recorded per profile: another profile opened on
			// it has no record of it yet.
			const signature = `${unlocked.profileId}:${tab.windowId}:${url}:${tab.title}`;
			const at = now();
			if (signature !== last.signature) {
				const look = await capture(tab, url, false);
				if (look !== null) {
					last = { signature, at, look };
				}
				return;
			}
			// Still on the same page.
			if (at - last.at < PREVIEW_REFRESH_MS) {
				return;
			}
			const look = await refreshPreview(tab, url, last.look);
			if (look !== null) {
				last = { signature, at, look };
			}
		},
		save: async (
			tab: CapturedTab,
		): Promise<"saved" | "locked" | "unsupported" | "failed"> => {
			const url = webUrl(tab);
			if (!url) {
				return "unsupported";
			}
			if (!(await session.get())) {
				return "locked";
			}
			return (await capture(tab, url, true)) !== null
				? "saved"
				: "failed";
		},
	};
};

export type PageCapture = ReturnType<typeof createPageCapture>;
