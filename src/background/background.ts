import { LINT_BOOLEAN } from "little-shared/enums";
import {
	createChromeNativeNotification,
	createNotifications,
} from "../services/notification";
import { getActiveTab } from "../utils/chrome";
import {
	getCurrentUserProfile,
	reconcileActiveSession,
} from "../services/user";
import {
	saveActiveWebPage,
	updateVisualBM,
	updateVisualBMPreview,
} from "../services/visualBM";
import { createNote } from "../services/note";
import { LittleAI } from "../services/ai";
import { getUserSettings } from "../services/settings";
import {
	LOCAL_AI_ORIGIN_RULE_ID,
	buildLocalAIOriginRule,
} from "./localAIOriginRule";

let keepAliveIntervalId: ReturnType<typeof setInterval> | null = null;
let lastCapturedTabSignature = "";
let lastCaptureAt = 0;

const CAPTURE_THROTTLE_MS = 15000;

// Only normal web pages can be screenshot reliably from the MV3 service worker.
const isCapturableTabUrl = (url?: string): url is string => {
	if (!url) {
		return false;
	}
	return /^https?:\/\//i.test(url);
};

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

const collectLocalAIPorts = async (): Promise<Array<string>> => {
	const ports = new Set(["11434", "1234"]);
	try {
		const settings = await getUserSettings();
		const customBaseUrl = settings.ai?.baseUrl?.trim();
		if (customBaseUrl) {
			const parsed = new URL(customBaseUrl);
			if (
				parsed.hostname === "localhost" ||
				parsed.hostname === "127.0.0.1" ||
				parsed.hostname === "[::1]"
			) {
				ports.add(
					parsed.port ||
						(parsed.protocol === "https:" ? "443" : "80"),
				);
			}
		}
	} catch {
		// Settings may be unavailable while the worker is booting.
	}
	return [...ports];
};

const configureLocalAIRequestHeaders = async (): Promise<void> => {
	const rules = [
		buildLocalAIOriginRule(await collectLocalAIPorts(), chrome.runtime.id),
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
void reconcileActiveSession();

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
	chrome.storage.onChanged.addListener((changes) => {
		if (changes.userSettings) {
			void configureLocalAIRequestHeaders();
		}
	});
}

function keepAlive() {
	if (keepAliveIntervalId !== null) {
		return;
	}
	keepAliveIntervalId = setInterval(() => {
		chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
	}, 20000);
}

chrome.runtime.onInstalled.addListener(async (details) => {
	await reconcileActiveSession();
	await configureLocalAIRequestHeaders();
	if (details.reason === "install") {
		chrome.storage.local.clear();
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
	await reconcileActiveSession();
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

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	const currentUserProfile = await getCurrentUserProfile();
	if (!currentUserProfile) {
		await notifyContextAction("Unlock a profile first.");
		return;
	}
	if (info.menuItemId === "convertPageToSave") {
		if (tab?.id !== undefined) {
			try {
				await saveActiveWebPage();
				await notifyContextAction("Page saved to Little Later.");
			} catch (error) {
				console.error("Failed to save page from context menu.", error);
				await notifyContextAction("Couldn't save this page.");
			}
		}
	} else if (info.menuItemId === "noteThis") {
		if (tab?.id !== undefined && info.selectionText) {
			try {
				await createNote({ content: info.selectionText });
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
				await createNote({ content: summary });
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
				await createNote({ content: keypoints });
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

const captureActiveTab = async () => {
	const currentUserProfile = await getCurrentUserProfile();
	if (!currentUserProfile) return;
	const activeTab = await getActiveTab();
	if (!activeTab) return;
	if (
		!isCapturableTabUrl(activeTab.url) ||
		activeTab.windowId === undefined
	) {
		return;
	}

	const activeTabUrl = activeTab.url;
	const activeTabTitle = activeTab.title?.trim() || "Untitled";
	const signature = `${activeTab.windowId}:${activeTabUrl}:${activeTabTitle}`;
	const now = Date.now();
	if (
		signature === lastCapturedTabSignature &&
		now - lastCaptureAt < CAPTURE_THROTTLE_MS
	) {
		return;
	}

	try {
		const dataUrl = await captureVisibleTab(activeTab.windowId);
		if (!dataUrl) {
			return;
		}
		const response = await fetch(dataUrl);
		const imageBlob = await response.blob();
		await updateVisualBM(activeTabUrl, {
			title: activeTabTitle,
			hasBrowsed: LINT_BOOLEAN.TRUE,
		});
		await updateVisualBMPreview(activeTabUrl, imageBlob);
		lastCapturedTabSignature = signature;
		lastCaptureAt = now;
	} catch (error) {
		console.warn("Unable to persist captured tab preview.", error);
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

// Tab events are best-effort, so these alarms keep notifications and preview
// capture fresh even after the MV3 worker gets suspended.
chrome.alarms.create("createNotifications", {
	delayInMinutes: 0.5,
	periodInMinutes: 0.5,
});

chrome.alarms.create("captureActiveTab", {
	delayInMinutes: 0.5,
	periodInMinutes: 0.5,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "createNotifications") {
		try {
			await createNotifications();
		} catch (error) {
			console.error("Failed to create notifications.", error);
		}
	}
	if (alarm.name === "captureActiveTab") {
		await captureActiveTab();
	}
});

const getNotificationPayload = (notificationId: string): string => {
	const separator = notificationId.indexOf("::");
	return separator === -1 ? "" : notificationId.slice(separator + 2);
};

const openNotificationTarget = (notificationId: string): void => {
	if (notificationId.startsWith("vbmReminder")) {
		const vbmUrl = getNotificationPayload(notificationId);
		if (vbmUrl) {
			void chrome.tabs.create({ url: vbmUrl });
		}
		return;
	}
	if (chrome.action?.openPopup) {
		void chrome.action.openPopup();
	}
};

chrome.notifications.onButtonClicked.addListener(
	(notificationId, buttonIndex) => {
		if (notificationId.startsWith("vbmReminder") && buttonIndex === 1) {
			openNotificationTarget(notificationId);
		}
		chrome.notifications.clear(notificationId);
	},
);

chrome.notifications.onClicked.addListener((notificationId) => {
	openNotificationTarget(notificationId);
	chrome.notifications.clear(notificationId);
});
