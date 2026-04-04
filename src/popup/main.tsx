import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

if (import.meta.env.MODE === "production") {
	const origin = chrome.runtime.getURL("");

	const rules: Array<chrome.declarativeNetRequest.Rule> = [
		{
			id: 1,
			priority: 1,
			action: {
				type: chrome.declarativeNetRequest.RuleActionType
					.MODIFY_HEADERS,
				requestHeaders: [
					{
						header: "Origin",
						operation:
							chrome.declarativeNetRequest.HeaderOperation.SET,
						value: origin,
					},
				],
			},
			condition: {
				resourceTypes: [
					chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
					chrome.declarativeNetRequest.ResourceType.WEBSOCKET,
				],
				requestDomains: ["localhost"],
			},
		},
	];

	chrome.declarativeNetRequest.updateDynamicRules({
		removeRuleIds: [1],
		addRules: rules,
	});
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
