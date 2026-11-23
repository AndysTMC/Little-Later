import { currentOwner } from "../services/ai/owner";
import { readPage } from "../services/ai/pages";
import { recoverInterrupted } from "../services/ai/runs";
import { setLocalDispatch } from "../utils/send";
import Dexie from "dexie";
import { LAI_PROVIDERS } from "little-shared/enums";
import { createChromeNativeNotification } from "./notify";
import { recordRefused } from "../services/refusedNotices";
import { dropPreV1Settings } from "../services/settings";
import {
	SIDE_PANEL_STORAGE_KEY,
	applySidePanelMode,
	getSidePanelMode,
	isSidePanelMode,
} from "../services/sidePanel";
import { LittleAI } from "../services/ai";
import { importProfileKeys } from "../storage/keys";
import { getSettings } from "../storage/repositories";
import {
	getDefaultBaseUrl,
	getResolvedBaseUrl,
	isLoopbackUrl,
} from "../services/ai/config";
import {
	LOCAL_AI_ORIGIN_RULE_ID,
	buildLocalAIOriginRule,
} from "./localAIOriginRule";
import { commands } from "./commands";
import { cleanUpImports } from "./commands/backup";
import { listenForCommands } from "./commands/listener";
import {
	createCommandContext,
	createDispatcher,
	createSerialQueue,
} from "./commands/registry";
import {
	REMINDER_ALARM,
	createReminderScheduler,
	isLittleNotice,
	rearmAfterCommands,
	watchScheduleTables,
} from "./scheduler";
import { createAutoLock } from "./autoLock";
import { createPageCapture } from "./capture";
import { createNativeMcpBridge } from "./mcpBridge";
import { openLittleDB } from "../storage/schema";
import { sessionStore, toBase64 } from "../storage/session";
import { ALLOWED_IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "./commands/images";
import { STAGED_FILE_MAX_AGE, staging } from "../storage/staging";
import { rememberedStagedFiles } from "../popup/uiState";

const littleDB = openLittleDB();
const writeQueue = createSerialQueue();
const reminderScheduler = createReminderScheduler({
	db: littleDB,
	session: sessionStore,
	now: Date.now,
	zone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
	queue: writeQueue,
	setAlarm: async (when) => {
		if (when === null) {
			await chrome.alarms.clear(REMINDER_ALARM);
		} else {
			await chrome.alarms.create(REMINDER_ALARM, { when });
		}
	},
	notify: (id, message, image) =>
		createChromeNativeNotification({ id, message, priority: 1, image }),
	refused: recordRefused,
});

const runReminderScheduler = () => {
	reminderScheduler.run().catch((error: unknown) => {
		console.error("Reminder scheduler failed.", error);
	});
};

const scheduleTables = watchScheduleTables(littleDB);

// Registered synchronously at start-up, so a message that wakes the worker
// finds its listener (0012).
const dispatchCommand = rearmAfterCommands(
	createDispatcher(
		commands,
		createCommandContext(littleDB, sessionStore),
		writeQueue,
	),
	runReminderScheduler,
	scheduleTables.takeChanged,
);
// Work the worker runs itself, such as LittleAI's runs, writes through the
// same dispatcher (decision 0017).
setLocalDispatch(dispatchCommand);
// A run cannot outlive the worker: one left from before it started is
// stored as interrupted, so the chat says so.
void recoverInterrupted();

const autoLock = createAutoLock({
	db: littleDB,
	session: sessionStore,
	queue: writeQueue,
	idle: chrome.idle,
});
autoLock.start();

const mcpBridge = createNativeMcpBridge({
	db: littleDB,
	session: sessionStore,
	dispatch: dispatchCommand,
});
void mcpBridge.sync();

// The options carry a write's binding to a profile and unlock (registry.ts,
// DispatchOptions); dropping them let a write outlive its unlock.
listenForCommands(async (name, input, options) => {
	const result = await dispatchCommand(name, input, options);
	if (result.ok && name === "profile.update") {
		void autoLock.configure();
	}
	if (result.ok && name === "settings.update") {
		await configureLocalAIRequestHeaders();
		void mcpBridge.sync();
	}
	return result;
});

// Every worker start: browser start, extension update, and waking after
// suspension. Fires what was missed and re-arms the alarm.
runReminderScheduler();

// Keep Chrome's side panel behaviour synced with the browser-level setting.
void getSidePanelMode().then(applySidePanelMode);
if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
	chrome.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== "local") return;
		const change = changes[SIDE_PANEL_STORAGE_KEY];
		if (change && isSidePanelMode(change.newValue)) {
			void applySidePanelMode(change.newValue);
		}
	});
}

// A device that wakes may be in another zone, which moves floating
// deadlines (0011).
chrome.idle.onStateChanged.addListener((state) => {
	if (state === "active") {
		runReminderScheduler();
	}
});

// An import still running when the worker starts was cut off (0012, Jobs),
// and staged files a closed page left behind are swept (0012, Messaging).
writeQueue(async () => {
	await cleanUpImports(littleDB);
	await staging.sweep(
		Date.now() - STAGED_FILE_MAX_AGE,
		await rememberedStagedFiles(),
	);
}).catch((error: unknown) => {
	console.error("Couldn't clean up after the last run.", error);
});

// Wrap the callback API so the worker can safely skip unsupported windows/tabs.
const captureVisibleTab = async (
	windowId: number,
): Promise<string | undefined> => {
	return await new Promise((resolve) => {
		chrome.tabs.captureVisibleTab(
			windowId,
			{ format: "jpeg", quality: 85 },
			(dataUrl) => {
				if (chrome.runtime.lastError) {
					const message =
						chrome.runtime.lastError.message ??
						"captureVisibleTab failed.";
					console.debug(
						`Skipping tab capture for window ${windowId}: ${message}`,
					);
					resolve(undefined);
					return;
				}
				resolve(dataUrl);
			},
		);
	});
};

// Previews are shown as thumbnails, so a full-resolution screenshot only
// costs disk space and decryption time. Falls back to the screenshot as it
// is if the worker cannot resize it.
const PREVIEW_MAX_WIDTH = 960;
const previewBytes = async (dataUrl: string): Promise<Uint8Array> => {
	const original = await (await fetch(dataUrl)).blob();
	try {
		const bitmap = await createImageBitmap(original);
		try {
			const scale = Math.min(1, PREVIEW_MAX_WIDTH / bitmap.width);
			if (scale < 1) {
				const canvas = new OffscreenCanvas(
					Math.round(bitmap.width * scale),
					Math.round(bitmap.height * scale),
				);
				canvas
					.getContext("2d")
					?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
				const resized = await canvas.convertToBlob({
					type: "image/jpeg",
					quality: 0.8,
				});
				return new Uint8Array(await resized.arrayBuffer());
			}
		} finally {
			bitmap.close();
		}
	} catch (error) {
		console.debug("Keeping the preview at full size.", error);
	}
	return new Uint8Array(await original.arrayBuffer());
};

const pageCapture = createPageCapture({
	db: littleDB,
	session: sessionStore,
	queue: writeQueue,
	dispatch: dispatchCommand,
	now: Date.now,
	screenshot: async (windowId) => {
		const dataUrl = await captureVisibleTab(windowId);
		return dataUrl ? previewBytes(dataUrl) : undefined;
	},
	readSnapshot: async (tab) => {
		if (tab.id === undefined || !tab.url) return undefined;
		const content = await readPage({
			tabId: tab.id,
			url: tab.url,
			title: tab.title ?? "",
		});
		return content.text || undefined;
	},
	isShowing: async (tab) => {
		const [active] = await chrome.tabs.query({
			active: true,
			windowId: tab.windowId,
		});
		return active?.id === tab.id && active?.url === tab.url;
	},
});

// The built-in providers' endpoints, plus the configured endpoint when it is
// on this machine. A remote endpoint never gets the loopback Origin.
const collectLocalAIEndpoints = async (): Promise<Array<URL>> => {
	const endpoints = [
		getDefaultBaseUrl(LAI_PROVIDERS.OLLAMA),
		getDefaultBaseUrl(LAI_PROVIDERS.LM_STUDIO),
	];
	// The configured endpoint is in the profile's sealed settings, so it is
	// known only while a profile is unlocked.
	const unlocked = await sessionStore.get();
	if (unlocked) {
		const { ai } = await getSettings(
			littleDB,
			await importProfileKeys(unlocked),
		);
		endpoints.push(getResolvedBaseUrl(ai));
	}
	// getResolvedBaseUrl returns "" for a missing or invalid custom URL.
	return endpoints
		.filter((endpoint) => endpoint !== "")
		.map((endpoint) => new URL(endpoint))
		.filter(isLoopbackUrl);
};

let headerRuleChain: Promise<void> = Promise.resolve();
const configureLocalAIRequestHeaders = (): Promise<void> => {
	const next = headerRuleChain.then(async () => {
		const rules = [
			buildLocalAIOriginRule(
				await collectLocalAIEndpoints(),
				chrome.runtime.id,
			),
		];
		try {
			await chrome.declarativeNetRequest.updateDynamicRules({
				removeRuleIds: [LOCAL_AI_ORIGIN_RULE_ID],
				addRules: rules,
			});
		} catch (error) {
			console.warn(
				"Unable to configure local AI request headers.",
				error,
			);
		}
	});
	headerRuleChain = next.catch(() => undefined);
	return next;
};

void configureLocalAIRequestHeaders();

sessionStore.subscribe(() => {
	void configureLocalAIRequestHeaders();
	void mcpBridge.sync();
});

// Format v1 replaces the pre-v1 database, its notification alarm, and the
// settings that held the AI key in chrome.storage.local (decision 0010).
const removePreV1Data = async (): Promise<void> => {
	await Dexie.delete("LLDB");
	await chrome.alarms.clear("createNotifications");
	await dropPreV1Settings();
};

chrome.runtime.onInstalled.addListener(async (details) => {
	await configureLocalAIRequestHeaders();
	if (details.reason === "install") {
		await chrome.storage.local.clear();
	}
	if (details.reason === "update") {
		removePreV1Data().catch((error: unknown) => {
			console.error("Couldn't remove pre-v1 data.", error);
		});
	}
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({
			id: "convertPageToSave",
			title: "Save page",
			contexts: ["page"],
		});
		chrome.contextMenus.create({
			id: "saveImageToLittleLater",
			title: "Save image to Little Later",
			contexts: ["image"],
		});
		chrome.contextMenus.create({
			id: "saveQuoteToLittleLater",
			title: "Save quote to Little Later",
			contexts: ["selection"],
		});
		chrome.contextMenus.create({
			id: "noteThis",
			title: "Note text",
			contexts: ["selection"],
		});
		chrome.contextMenus.create({
			id: "noteQuickSummary",
			title: "Note quick summary (AI)",
			contexts: ["selection"],
		});
		chrome.contextMenus.create({
			id: "noteKeypoints",
			title: "Note keypoints (AI)",
			contexts: ["selection"],
		});
	});
});

chrome.runtime.onStartup.addListener(async (): Promise<void> => {
	await configureLocalAIRequestHeaders();
});

const notifyContextAction = async (message: string): Promise<void> => {
	try {
		await createChromeNativeNotification({
			id: `contextAction${Date.now()}`,
			message,
			priority: 0,
			requireInteraction: false,
		});
	} catch (error) {
		console.warn("Unable to show context menu confirmation.", error);
	}
};

// `profileId` keeps a note made from slow AI work in the profile it was
// started in: the command is refused if another profile has been opened
// meanwhile.
const createNote = async (
	content: string,
	profileId?: string,
): Promise<void> => {
	const result = await dispatchCommand(
		"note.create",
		{ content },
		profileId ? { profileId } : undefined,
	);
	if (!result.ok) {
		throw new Error(result.error.message);
	}
};

const SAVE_PAGE_NOTICES = {
	saved: "Page saved to Little Later.",
	locked: "Unlock a profile first.",
	unsupported: "Only web pages can be saved.",
	failed: "Couldn't save this page.",
};

const inferImageTitle = (srcUrl: string, tabTitle?: string): string => {
	try {
		const parsed = new URL(srcUrl);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			const segment = decodeURIComponent(
				parsed.pathname.split("/").pop() ?? "",
			)
				.replace(/\.[a-z0-9]{2,5}$/i, "")
				.replace(/[-_]+/g, " ")
				.trim();
			if (segment.length >= 2) {
				return segment.slice(0, 100);
			}
		}
	} catch {
		// Fall through to tab title or generic label.
	}
	return (tabTitle?.trim() || "Saved image").slice(0, 100);
};

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (!(await sessionStore.get())) {
		await notifyContextAction("Unlock a profile first.");
		return;
	}
	if (info.menuItemId === "saveImageToLittleLater") {
		const srcUrl = info.srcUrl;
		if (!srcUrl) {
			await notifyContextAction("Couldn't find that image.");
			return;
		}
		try {
			const response = await fetch(srcUrl);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const blob = await response.blob();
			const rawType = (blob.type || "").toLowerCase().split(";")[0];
			const mimeType = rawType === "image/jpg" ? "image/jpeg" : rawType;
			if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
				await notifyContextAction(
					"Only PNG, JPEG, WebP, GIF, and AVIF images can be saved.",
				);
				return;
			}
			const bytes = new Uint8Array(await blob.arrayBuffer());
			if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
				await notifyContextAction("Image is empty or over 10 MB.");
				return;
			}
			const sourceUrl =
				tab?.url && /^https?:\/\//i.test(tab.url) ? tab.url : undefined;
			const result = await dispatchCommand("image.create", {
				bytesBase64: toBase64(bytes),
				mimeType,
				title: inferImageTitle(srcUrl, tab?.title),
				sourceUrl,
			});
			if (!result.ok) {
				throw new Error(result.error.message);
			}
			await notifyContextAction("Image saved to Little Later.");
		} catch (error) {
			console.error("Failed to save image from context menu.", error);
			await notifyContextAction("Couldn't save that image.");
		}
		return;
	} else if (info.menuItemId === "saveQuoteToLittleLater") {
		if (info.selectionText) {
			try {
				const quote = info.selectionText
					.trim()
					.split(/\r?\n/)
					.map((line) => `> ${line}`)
					.join("\n");
				const pageUrl =
					tab?.url && /^https?:\/\//i.test(tab.url)
						? tab.url
						: undefined;
				const pageTitle = tab?.title?.trim() || pageUrl || "Source";
				const content = pageUrl
					? `${quote}\n\n— [${pageTitle}](${pageUrl})`
					: quote;
				let saveIds: Array<string> | undefined;
				if (pageUrl) {
					const captured = await dispatchCommand("save.capture", {
						url: pageUrl,
						title: tab?.title,
						saved: true,
					});
					if (
						captured.ok &&
						captured.value &&
						typeof captured.value === "object" &&
						"id" in captured.value &&
						typeof captured.value.id === "string"
					) {
						saveIds = [captured.value.id];
					}
				}
				const created = await dispatchCommand("note.create", {
					content,
					tags: ["highlight"],
					saveIds,
				});
				if (!created.ok) {
					throw new Error(created.error.message);
				}
				await notifyContextAction("Quote saved to Little Later.");
			} catch (error) {
				console.error("Failed to save quote from context menu.", error);
				await notifyContextAction("Couldn't save that quote.");
			}
		}
		return;
	} else if (info.menuItemId === "convertPageToSave") {
		if (tab?.id !== undefined) {
			try {
				await notifyContextAction(
					SAVE_PAGE_NOTICES[await pageCapture.save(tab)],
				);
			} catch (error) {
				console.error("Failed to save page from context menu.", error);
				await notifyContextAction(SAVE_PAGE_NOTICES.failed);
			}
		}
	} else if (info.menuItemId === "noteThis") {
		if (tab?.id !== undefined && info.selectionText) {
			try {
				await createNote(info.selectionText);
				await notifyContextAction("Selection saved as a note.");
			} catch (error) {
				console.error(
					"Failed to create note from context menu.",
					error,
				);
				await notifyContextAction("Couldn't save that note.");
			}
		}
	} else if (info.menuItemId === "noteQuickSummary") {
		if (tab?.id !== undefined && info.selectionText) {
			try {
				// The profile clicked in owns the request to the end.
				const owner = await currentOwner();
				const aiSummarize = await LittleAI.getLAIAssistInstance(owner);
				const summary = await aiSummarize.summarize(
					info.selectionText,
					{
						type: "tldr",
						length: "medium",
						format: "plain-text",
					},
				);
				await owner.send("note.create", { content: summary });
				await notifyContextAction("Quick summary saved as a note.");
			} catch (error) {
				console.error("Failed to summarize selection.", error);
				await notifyContextAction(
					"Couldn't create an AI summary. Check AI settings.",
				);
			}
		}
	} else if (info.menuItemId === "noteKeypoints") {
		if (tab?.id !== undefined && info.selectionText) {
			try {
				const owner = await currentOwner();
				const aiSummarize = await LittleAI.getLAIAssistInstance(owner);
				const keypoints = await aiSummarize.summarize(
					info.selectionText,
					{
						type: "key-points",
						length: "medium",
						format: "plain-text",
					},
				);
				await owner.send("note.create", { content: keypoints });
				await notifyContextAction("Key points saved as a note.");
			} catch (error) {
				console.error("Failed to extract key points.", error);
				await notifyContextAction(
					"Couldn't create AI key points. Check AI settings.",
				);
			}
		}
	}
});

// The active tab of the window the user is in. A worker has no window of
// its own, so "current window" would be an arbitrary one.
const focusedActiveTab = async (): Promise<chrome.tabs.Tab | undefined> => {
	try {
		const [tab] = await chrome.tabs.query({
			active: true,
			lastFocusedWindow: true,
		});
		return tab;
	} catch (error) {
		console.debug("Could not read the active tab.", error);
		return undefined;
	}
};

const captureTab = async (tab: chrome.tabs.Tab | undefined): Promise<void> => {
	if (!tab) return;
	try {
		await pageCapture.visit(tab);
	} catch (error) {
		console.warn("Unable to capture the active tab.", error);
	}
};

chrome.tabs.onActivated.addListener(() => {
	void focusedActiveTab().then(captureTab);
});

chrome.tabs.onUpdated.addListener((_, changeInfo, tab) => {
	// A page that finished loading in the background is not a visit.
	if (changeInfo.status === "complete" && tab.active) {
		void focusedActiveTab().then((focused) => {
			if (focused?.id === tab.id) {
				void captureTab(focused);
			}
		});
	}
});

// Tab events are best-effort, so this alarm keeps preview capture fresh
// even after the MV3 worker gets suspended. It exists only while a profile
// is unlocked: nothing can be captured while locked, so there is no reason
// to wake the worker then.
const CAPTURE_ALARM = "captureActiveTab";
const syncCaptureAlarm = async (unlocked: boolean): Promise<void> => {
	if (!unlocked) {
		await chrome.alarms.clear(CAPTURE_ALARM);
		return;
	}
	if (!(await chrome.alarms.get(CAPTURE_ALARM))) {
		await chrome.alarms.create(CAPTURE_ALARM, {
			delayInMinutes: 0.5,
			periodInMinutes: 0.5,
		});
	}
};
const syncCaptureAlarmSafely = (unlocked: boolean) => {
	syncCaptureAlarm(unlocked).catch((error: unknown) => {
		console.warn("Could not update the capture alarm.", error);
	});
};

void sessionStore.get().then((unlocked) => {
	syncCaptureAlarmSafely(unlocked !== null);
});
sessionStore.subscribe((unlocked) => {
	syncCaptureAlarmSafely(unlocked !== null);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === CAPTURE_ALARM) {
		await captureTab(await focusedActiveTab());
	}
	if (alarm.name === REMINDER_ALARM) {
		runReminderScheduler();
	}
});

// Opens the popup, or the same page in a tab when the popup cannot open:
// Chrome refuses to open it unless one of its windows has focus, which is
// often not the case when a notification is clicked.
const openLittleLater = async (): Promise<void> => {
	try {
		const mode = await getSidePanelMode();
		const window = await chrome.windows.getLastFocused({
			windowTypes: ["normal"],
		});
		if (window.id !== undefined) {
			await chrome.windows.update(window.id, { focused: true });
			if (mode === "everything" && chrome.sidePanel?.open) {
				await chrome.sidePanel.open({ windowId: window.id });
				return;
			}
		}
		await chrome.action.openPopup();
	} catch (error) {
		console.debug("Opening Little Later in a tab instead.", error);
		await chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
	}
};

const openReminderNotice = async (notificationId: string): Promise<void> => {
	const url = await reminderScheduler.noticeTarget(notificationId);
	if (url) {
		await chrome.tabs.create({ url });
	} else {
		await openLittleLater();
	}
};

chrome.notifications.onClicked.addListener((notificationId) => {
	if (isLittleNotice(notificationId)) {
		openReminderNotice(notificationId).catch((error: unknown) => {
			console.error("Could not open the reminder.", error);
		});
	} else {
		openLittleLater().catch((error: unknown) => {
			console.error("Could not open Little Later.", error);
		});
	}
	chrome.notifications.clear(notificationId);
});
