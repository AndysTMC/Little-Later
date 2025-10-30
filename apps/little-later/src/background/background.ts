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

function keepAlive() {
	setInterval(() => {
		chrome.runtime.getPlatformInfo(function (info) {
			console.log("Keeping service worker alive. Platform: " + info.os);
		});
	}, 20000);
}

chrome.runtime.onInstalled.addListener(async () => {
	chrome.storage.local.clear();
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
	keepAlive();
});

chrome.runtime.onStartup.addListener(async (): Promise<void> => {
	keepAlive();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId === "convertPageToSave") {
		if (tab?.id !== undefined) {
			await saveActiveWebPage();
		}
	} else if (info.menuItemId === "addToNotes") {
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
	const activeTabUrl = activeTab.url || "about:blank";
	if (!activeTabUrl.startsWith("https:")) return;
	const activeTabTitle = activeTab.title || "Untitled";
	chrome.tabs.captureVisibleTab(
		{ format: "jpeg", quality: 100 },
		async (dataUrl) => {
			if (chrome.runtime.lastError) {
				console.log("Error capturing tab:", chrome.runtime.lastError);
				return;
			}
			if (!activeTab || !activeTab.url || !activeTab.title) return;
			const response = await fetch(dataUrl);
			const imageBlob = await response.blob();
			await updateVisualBM(activeTabUrl, {
				title: activeTabTitle,
				hasBrowsed: LINT_BOOLEAN.TRUE,
			});
			await updateVisualBMPreview(activeTabUrl, imageBlob);
		},
	);
};

chrome.tabs.onActivated.addListener(async () => {
	captureActiveTab();
});

chrome.tabs.onUpdated.addListener(async (_, changeInfo) => {
	if (changeInfo.status === "complete") {
		captureActiveTab();
	}
});

chrome.tabs.onRemoved.addListener(async () => {
	captureActiveTab();
});

chrome.alarms.create("createNotifications", {
	delayInMinutes: 0.5,
	periodInMinutes: 0.5,
});

chrome.alarms.create("captureActiveTab", {
	delayInMinutes: 0.5,
	periodInMinutes: 0.1,
});

chrome.alarms.create("storeFromCloud", {
	delayInMinutes: 0.1,
	periodInMinutes: 0.15,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name === "createNotifications") {
		await createNotifications();
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
