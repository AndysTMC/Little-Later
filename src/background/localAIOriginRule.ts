export const LOCAL_AI_ORIGIN_RULE_ID = 91001;

export const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Local AI servers (Ollama, LM Studio) reject the chrome-extension:// origin,
// so the extension's own requests to them are sent as coming from 127.0.0.1.
// initiatorDomains keeps the rewrite to this extension: without it, any
// website's requests to these servers would get the trusted origin too.
// Chrome matches a rule against the request's canonical URL, which leaves
// out a default port, so the filter is built from each endpoint's
// URL.origin, which is canonical in the same way.
export const buildLocalAIOriginRule = (
	endpoints: Array<URL>,
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
		regexFilter: `^(${[...new Set(endpoints.map((url) => url.origin))]
			.map(escapeRegex)
			.join("|")})/`,
	},
});
