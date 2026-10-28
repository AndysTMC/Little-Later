export const LOCAL_AI_ORIGIN_RULE_ID = 91001;

export const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Local AI servers (Ollama, LM Studio) reject the chrome-extension:// origin,
// so the extension's own requests to them are sent as coming from 127.0.0.1.
// initiatorDomains keeps the rewrite to this extension: without it, any
// website's requests to these ports would get the trusted origin too.
// An empty port stands for the scheme's default port, which Chrome leaves
// out of the URL it matches against.
const portPattern = (ports: Array<string>): string => {
	const explicit = ports.filter((port) => port !== "").map(escapeRegex);
	const allowDefault = ports.includes("");
	return `(?::(${explicit.join("|")}))${allowDefault ? "?" : ""}`;
};

export const buildLocalAIOriginRule = (
	ports: Array<string>,
	extensionId: string,
): chrome.declarativeNetRequest.Rule => ({
	id: LOCAL_AI_ORIGIN_RULE_ID,
	priority: 1,
	action: {
		type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
		requestHeaders: [
			{
				header: "Origin",
				operation:
					"set" as chrome.declarativeNetRequest.HeaderOperation,
				value: "http://127.0.0.1",
			},
		],
	},
	condition: {
		initiatorDomains: [extensionId],
		resourceTypes: [
			"xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
			"websocket" as chrome.declarativeNetRequest.ResourceType,
		],
		regexFilter: `^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\])${portPattern(ports)}/`,
	},
});
