const DEFAULT_TIMEOUT_MS = 5000;

const providers = [
	{
		name: "ollama",
		baseUrl: "http://127.0.0.1:11434/v1",
		apiKey: "",
	},
	{
		name: "lmstudio",
		baseUrl: "http://127.0.0.1:1234/v1",
		apiKey: "",
	},
];

const customBaseUrl = process.env.AI_LIVE_CUSTOM_BASE_URL?.trim() ?? "";
const preferredModel = process.env.AI_LIVE_MODEL?.trim() ?? "";
if (customBaseUrl !== "") {
	providers.push({
		name: "custom",
		baseUrl: customBaseUrl,
		apiKey: process.env.AI_LIVE_CUSTOM_API_KEY?.trim() ?? "",
	});
}

const timeoutFetch = async (
	url: string,
	init: RequestInit,
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> => {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {
			...init,
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}
};

const joinUrl = (baseUrl: string, path: string): string =>
	`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const modelEndpoints = (baseUrl: string): Array<string> => {
	const normalized = baseUrl.replace(/\/+$/, "");
	return Array.from(
		new Set([
			joinUrl(normalized, "models"),
			joinUrl(normalized, "v1/models"),
			joinUrl(normalized.replace(/\/v1\/?$/, ""), "api/tags"),
		]),
	);
};

const extractModels = (payload: unknown): Array<string> => {
	if (!payload || typeof payload !== "object") {
		return [];
	}
	const data = (payload as { data?: unknown }).data;
	const fromData = Array.isArray(data)
		? data
				.map((item) => {
					if (!item || typeof item !== "object") {
						return null;
					}
					const id = (item as { id?: unknown }).id;
					return typeof id === "string" ? id : null;
				})
				.filter((value): value is string => value !== null)
		: [];

	const models = (payload as { models?: unknown }).models;
	const fromModels = Array.isArray(models)
		? models
				.map((item) => {
					if (!item || typeof item !== "object") {
						return null;
					}
					const name = (item as { name?: unknown }).name;
					if (typeof name === "string") {
						return name;
					}
					const id = (item as { id?: unknown }).id;
					return typeof id === "string" ? id : null;
				})
				.filter((value): value is string => value !== null)
		: [];

	return Array.from(new Set([...fromData, ...fromModels]));
};

const getHeaders = (apiKey: string): Record<string, string> => {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "application/json",
	};
	if (apiKey !== "") {
		headers.Authorization = `Bearer ${apiKey}`;
	}
	return headers;
};

const fetchModels = async (
	baseUrl: string,
	apiKey: string,
): Promise<Array<string>> => {
	const headers = getHeaders(apiKey);
	for (const endpoint of modelEndpoints(baseUrl)) {
		try {
			const response = await timeoutFetch(endpoint, {
				method: "GET",
				headers,
			});
			if (!response.ok) {
				continue;
			}
			const payload = (await response.json()) as unknown;
			const models = extractModels(payload);
			if (models.length > 0) {
				return models;
			}
		} catch {
			// Try the next endpoint.
		}
	}
	return [];
};

const runCompletionSmoke = async (
	baseUrl: string,
	apiKey: string,
	model: string,
): Promise<boolean> => {
	const response = await timeoutFetch(joinUrl(baseUrl, "chat/completions"), {
		method: "POST",
		headers: getHeaders(apiKey),
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: "Reply with exactly: smoke-ok" }],
			temperature: 0,
		}),
	}, 10000);
	if (!response.ok) {
		throw new Error(`completion status ${response.status}`);
	}
	const payload = (await response.json()) as {
		choices?: Array<{ message?: { content?: string | null } }>;
	};
	const content = payload.choices?.[0]?.message?.content ?? "";
	return content.toLowerCase().includes("smoke-ok");
};

const runToolSmoke = async (
	baseUrl: string,
	apiKey: string,
	model: string,
): Promise<"supported" | "unsupported"> => {
	const response = await timeoutFetch(joinUrl(baseUrl, "chat/completions"), {
		method: "POST",
		headers: getHeaders(apiKey),
		body: JSON.stringify({
			model,
			messages: [
				{
					role: "user",
					content:
						"Call get_current_date_time_info and then say done in final answer.",
				},
			],
			tools: [
				{
					type: "function",
					function: {
						name: "get_current_date_time_info",
						description: "Returns current date and time information",
						parameters: {
							type: "object",
							properties: {},
							required: [],
							additionalProperties: false,
						},
					},
				},
			],
			tool_choice: "auto",
			temperature: 0,
		}),
	}, 10000);
	if (!response.ok) {
		return "unsupported";
	}
	const payload = (await response.json()) as {
		choices?: Array<{
			message?: {
				tool_calls?: Array<unknown>;
			};
		}>;
	};
	const hasToolCalls =
		(payload.choices?.[0]?.message?.tool_calls?.length ?? 0) > 0;
	return hasToolCalls ? "supported" : "unsupported";
};

const run = async () => {
	let failed = false;
	let checked = 0;

	for (const provider of providers) {
		const providerTag = `[${provider.name}]`;
		console.log(`${providerTag} checking ${provider.baseUrl}`);

		const models = await fetchModels(provider.baseUrl, provider.apiKey);
		if (models.length === 0) {
			console.log(`${providerTag} skipped (no models available / provider offline).`);
			continue;
		}

		checked += 1;
		const model =
			preferredModel !== "" && models.includes(preferredModel)
				? preferredModel
				: models[0];
		console.log(`${providerTag} models ok (${models.length}) -> using ${model}`);

		try {
			const completionOk = await runCompletionSmoke(
				provider.baseUrl,
				provider.apiKey,
				model,
			);
			if (!completionOk) {
				failed = true;
				console.error(`${providerTag} completion smoke failed (unexpected content).`);
				continue;
			}
			console.log(`${providerTag} completion smoke passed.`);

			const toolStatus = await runToolSmoke(
				provider.baseUrl,
				provider.apiKey,
				model,
			);
			if (toolStatus === "supported") {
				console.log(`${providerTag} tool-call smoke passed.`);
			} else {
				console.log(`${providerTag} tool-call smoke skipped (provider/model did not emit tool_calls).`);
			}
		} catch (error: unknown) {
			failed = true;
			console.error(`${providerTag} failed:`, error);
		}
	}

	if (checked === 0) {
		console.log("No live AI providers were reachable. This is optional, so exiting without failure.");
		return;
	}

	if (failed) {
		process.exitCode = 1;
		console.error("AI live smoke finished with failures.");
		return;
	}

	console.log("AI live smoke passed.");
};

void run();
