import Dexie from "dexie";
import { LAI_PROVIDERS } from "little-shared/enums";
import { createChromeNativeNotification } from "./notify";
import { dropPreV1Settings } from "../services/settings";
import { getActiveTab } from "../utils/chrome";
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
} from "./scheduler";
import { createAutoLock } from "./autoLock";
import { createPageCapture } from "./capture";
import { openLittleDB } from "../storage/schema";
import { sessionStore } from "../storage/session";
import { STAGED_FILE_MAX_AGE, staging } from "../storage/staging";

const littleDB = openLittleDB();
const writeQueue = createSerialQueue();
const reminderScheduler = createReminderScheduler({
	db: littleDB,
	session: sessionStore,
	now: Date.now,
	queue: writeQueue,
	setAlarm: async (when) => {
		if (when === null) {
			await chrome.alarms.clear(REMINDER_ALARM);
		} else {
			await chrome.alarms.create(REMINDER_ALARM, { when });
		}
	},
	notify: (id, message) =>
		createChromeNativeNotification({ id, message, priority: 1 }),
});

const runReminderScheduler = () => {
	reminderScheduler.run().catch((error: unknown) => {
		console.error("Reminder scheduler failed.", error);
	});
};

// Registered synchronously at start-up, so a message that wakes the worker
// finds its listener (0012).
const dispatchCommand = rearmAfterCommands(
	createDispatcher(
		commands,
		createCommandContext(littleDB, sessionStore),
		writeQueue,
	),
	runReminderScheduler,
);
const autoLock = createAutoLock({
	db: littleDB,
	session: sessionStore,
	queue: writeQueue,
	idle: chrome.idle,
});
autoLock.start();

listenForCommands(async (name, input) => {
	const result = await dispatchCommand(name, input);
	if (result.ok && name === "profile.update") {
		void autoLock.configure();
	}
	if (result.ok && name === "settings.update") {
		void configureLocalAIRequestHeaders();
	}
	return result;
});

// Every worker start: browser start, extension update, and waking after
// suspension. Fires what was missed and re-arms the alarm.
runReminderScheduler();

// An import still running when the worker starts was cut off (0012, Jobs),
// and staged files a closed page left behind are swept (0012, Messaging).
writeQueue(async () => {
	await cleanUpImports(littleDB);
	await staging.sweep(Date.now() - STAGED_FILE_MAX_AGE);
}).catch((error: unknown) => {
	console.error("Couldn't clean up after the last run.", error);
});

let keepAliveIntervalId: ReturnType<typeof setInterval> | null = null;

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

const pageCapture = createPageCapture({
	db: littleDB,
	session: sessionStore,
	queue: writeQueue,
	dispatch: dispatchCommand,
	now: Date.now,
	screenshot: async (windowId) => {
		const dataUrl = await captureVisibleTab(windowId);
		return dataUrl
			? new Uint8Array(await (await fetch(dataUrl)).arrayBuffer())
			: undefined;
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

const configureLocalAIRequestHeaders = async (): Promise<void> => {
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
		console.warn("Unable to configure local AI request headers.", error);
	}
};

void configureLocalAIRequestHeaders();

sessionStore.subscribe(() => {
	void configureLocalAIRequestHeaders();
});

function keepAlive() {
	if (keepAliveIntervalId !== null) {
		return;
	}
	keepAliveIntervalId = setInterval(() => {
		chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
	}, 20000);
}

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
		chrome.storage.local.clear();
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
	keepAlive();
});

chrome.runtime.onStartup.addListener(async (): Promise<void> => {
	await configureLocalAIRequestHeaders();
	keepAlive();
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

const createNote = async (content: string): Promise<void> => {
	const result = await dispatchCommand("note.create", { content });
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (!(await sessionStore.get())) {
		await notifyContextAction("Unlock a profile first.");
		return;
	}
	if (info.menuItemId === "convertPageToSave") {
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
				const aiSummarize = await LittleAI.getLAISummarizeInstance();
				const summary = await aiSummarize.summarize(
					info.selectionText,
					{
						type: "tldr",
						length: "medium",
						format: "plain-text",
					},
				);
				await createNote(summary);
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
				const aiSummarize = await LittleAI.getLAISummarizeInstance();
				const keypoints = await aiSummarize.summarize(
					info.selectionText,
					{
						type: "key-points",
						length: "medium",
						format: "plain-text",
					},
				);
				await createNote(keypoints);
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

const captureActiveTab = async (): Promise<void> => {
	const activeTab = await getActiveTab();
	if (!activeTab) return;
	try {
		await pageCapture.visit(activeTab);
	} catch (error) {
		console.warn("Unable to capture the active tab.", error);
	}
};

chrome.tabs.onActivated.addListener(async () => {
	void captureActiveTab();
});

chrome.tabs.onUpdated.addListener(async (_, changeInfo) => {
	if (changeInfo.status === "complete") {
		void captureActiveTab();
	}
});

// Tab events are best-effort, so this alarm keeps preview capture fresh
// even after the MV3 worker gets suspended.
chrome.alarms.create("captureActiveTab", {
	delayInMinutes: 0.5,
	periodInMinutes: 0.5,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "captureActiveTab") {
		await captureActiveTab();
	}
	if (alarm.name === REMINDER_ALARM) {
		runReminderScheduler();
	}
});

const openReminderNotice = async (notificationId: string): Promise<void> => {
	const url = await reminderScheduler.noticeTarget(notificationId);
	if (url) {
		await chrome.tabs.create({ url });
	} else if (chrome.action?.openPopup) {
		await chrome.action.openPopup();
	}
};

chrome.notifications.onClicked.addListener((notificationId) => {
	if (isLittleNotice(notificationId)) {
		openReminderNotice(notificationId).catch((error: unknown) => {
			console.error("Could not open the reminder.", error);
		});
	} else if (chrome.action?.openPopup) {
		void chrome.action.openPopup();
	}
	chrome.notifications.clear(notificationId);
});
