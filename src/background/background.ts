import { LINT_BOOLEAN } from "little-shared/enums";
import { createNotifications } from "../services/notification";
import { getActiveTab } from "../utils/chrome";
import { getCurrentUserProfile } from "../services/user";
import {
	saveActiveWebPage,
	updateVisualBM,
	updateVisualBMPreview,
} from "../services/visualBM";
import { createNote } from "../services/note";
import { LittleAI } from "../services/ai";

const LOCAL_AI_ORIGIN_RULE_ID = 91001;
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

const configureLocalAIRequestHeaders = async (): Promise<void> => {
	const rules: Array<chrome.declarativeNetRequest.Rule> = [
		{
			id: LOCAL_AI_ORIGIN_RULE_ID,
			priority: 1,
			action: {
				type: chrome.declarativeNetRequest.RuleActionType
					.MODIFY_HEADERS,
				requestHeaders: [
					{
						header: "Origin",
						operation:
							chrome.declarativeNetRequest.HeaderOperation.SET,
						value: "http://127.0.0.1",
					},
				],
			},
			condition: {
				resourceTypes: [
					chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
					chrome.declarativeNetRequest.ResourceType.WEBSOCKET,
				],
				regexFilter: "^https?://(localhost|127\\.0\\.0\\.1)(:[0-9]+)?/",
			},
		},
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

function keepAlive() {
	if (keepAliveIntervalId !== null) {
		return;
	}
	keepAliveIntervalId = setInterval(() => {
		chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
	}, 20000);
}

chrome.runtime.onInstalled.addListener(async (details) => {
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
	await configureLocalAIRequestHeaders();
	keepAlive();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId === "convertPageToSave") {
		if (tab?.id !== undefined) {
			await saveActiveWebPage();
		}
	} else if (info.menuItemId === "noteThis") {
		if (tab?.id !== undefined && info.selectionText) {
			await createNote({ content: info.selectionText });
		}
	} else if (info.menuItemId === "noteQuickSummary") {
		if (tab?.id !== undefined && info.selectionText) {
			const aiSummarize = await LittleAI.getLAISummarizeInstance();
			const summary = await aiSummarize.summarize(info.selectionText, {
				type: "tldr",
				length: "medium",
				format: "plain-text",
			});
			await createNote({ content: summary });
		}
	} else if (info.menuItemId === "noteKeypoints") {
		if (tab?.id !== undefined && info.selectionText) {
			const aiSummarize = await LittleAI.getLAISummarizeInstance();
			const keypoints = await aiSummarize.summarize(info.selectionText, {
				type: "key-points",
				length: "medium",
				format: "plain-text",
			});
			await createNote({ content: keypoints });
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

chrome.notifications.onButtonClicked.addListener(
	(notificationId, buttonIndex) => {
		if (notificationId.startsWith("vbmReminder")) {
			if (buttonIndex === 1) {
				const vbmUrl = notificationId.split("::")[1];
				chrome.tabs.create({ url: vbmUrl });
			}
			chrome.notifications.clear(notificationId);
		}
	},
);
