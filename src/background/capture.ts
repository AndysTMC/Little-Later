import { putPreview } from "../storage/repositories";
import { importProfileKeys } from "../storage/keys";
import type { LittleDB } from "../storage/schema";
import type { SessionStore } from "../storage/session";
import type { Dispatch, SerialQueue } from "./commands/registry";

// The same tab is captured at most this often.
export const CAPTURE_THROTTLE_MS = 15_000;

export type CapturedTab = { url?: string; title?: string; windowId?: number };

// Only normal web pages can be screenshot reliably from the worker.
const webUrl = (tab: CapturedTab): string | null =>
	tab.url && /^https?:\/\//i.test(tab.url) && tab.windowId !== undefined
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
}: {
	db: LittleDB;
	session: SessionStore;
	queue: SerialQueue;
	dispatch: Dispatch;
	now: () => number;
	screenshot: (windowId: number) => Promise<Uint8Array | undefined>;
}) => {
	let last = { signature: "", at: -Infinity };

	const capture = async (
		tab: CapturedTab,
		url: string,
		saved: boolean,
	): Promise<boolean> => {
		const unlocked = await session.get();
		if (!unlocked) {
			return false;
		}
		const bytes = await screenshot(tab.windowId!);
		// Another profile may have been opened during the screenshot; the
		// page belongs to the one that was browsing.
		const result = await dispatch(
			"save.capture",
			{ url, title: tab.title?.trim() ?? "", saved },
			{ profileId: unlocked.profileId },
		);
		if (!result.ok) {
			return false;
		}
		const { id } = result.value as { id: string };
		if (bytes) {
			// Behind the writes queued meanwhile: the profile may have been
			// locked or the page deleted since.
			await queue(async () => {
				const current = await session.get();
				if (current?.profileId === unlocked.profileId) {
					await putPreview(
						db,
						await importProfileKeys(current),
						id,
						bytes,
						now(),
					);
				}
			});
		}
		return true;
	};

	return {
		visit: async (tab: CapturedTab): Promise<void> => {
			const url = webUrl(tab);
			if (!url) {
				return;
			}
			const signature = `${tab.windowId}:${url}:${tab.title}`;
			const at = now();
			if (
				signature === last.signature &&
				at - last.at < CAPTURE_THROTTLE_MS
			) {
				return;
			}
			if (await capture(tab, url, false)) {
				last = { signature, at };
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
			return (await capture(tab, url, true)) ? "saved" : "failed";
		},
	};
};

export type PageCapture = ReturnType<typeof createPageCapture>;
