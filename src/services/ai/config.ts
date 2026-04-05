import { LAI_PROVIDERS } from "little-shared/enums";
import { LAISettings } from "little-shared/types";
import { ResponseFormatJSONSchema } from "openai/resources.mjs";

export const baseUrls = new Map<string, string>([
	[LAI_PROVIDERS.OLLAMA, "http://127.0.0.1:11434/v1"],
	[LAI_PROVIDERS.LM_STUDIO, "http://127.0.0.1:1234/v1"],
	[LAI_PROVIDERS.CUSTOM, ""],
]);

export const responseFormats = new Map<string, string>([
	[LAI_PROVIDERS.OLLAMA, "json_object"],
	[LAI_PROVIDERS.LM_STUDIO, "json_object"],
	[LAI_PROVIDERS.CUSTOM, "json_object"],
]);

export const getDefaultBaseUrl = (provider: LAI_PROVIDERS): string =>
	baseUrls.get(provider) ?? "";

export const getResolvedBaseUrl = (
	aiSettings: Pick<LAISettings, "provider" | "baseUrl">,
): string => {
	if (aiSettings.provider === LAI_PROVIDERS.CUSTOM) {
		return aiSettings.baseUrl.trim();
	}
	return getDefaultBaseUrl(aiSettings.provider);
};

export const isAISettingsConfigured = (
	aiSettings?: LAISettings | null,
): boolean => {
	if (!aiSettings) {
		return false;
	}
	return (
		getResolvedBaseUrl(aiSettings) !== "" && aiSettings.model.trim() !== ""
	);
};

const joinUrl = (baseUrl: string, path: string): string => {
	return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
};

const fetchJSON = async (
	url: string,
	headers: Record<string, string>,
): Promise<unknown | null> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 4000);
	try {
		const response = await fetch(url, {
			method: "GET",
			headers,
			signal: controller.signal,
		});
		if (!response.ok) {
			return null;
		}
		return await response.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timeoutId);
	}
};

const extractModelNames = (payload: unknown): Array<string> => {
	if (!payload || typeof payload !== "object") {
		return [];
	}

	const idsFromOpenAI =
		"data" in payload && Array.isArray(payload.data)
			? payload.data
					.map((item) =>
						item &&
						typeof item === "object" &&
						"id" in item &&
						typeof item.id === "string"
							? item.id
							: null,
					)
					.filter((id): id is string => id !== null)
			: [];

	const idsFromOllama =
		"models" in payload && Array.isArray(payload.models)
			? payload.models
					.map((item) => {
						if (!item || typeof item !== "object") {
							return null;
						}
						if ("name" in item && typeof item.name === "string") {
							return item.name;
						}
						if ("id" in item && typeof item.id === "string") {
							return item.id;
						}
						return null;
					})
					.filter((id): id is string => id !== null)
			: [];

	const result: Array<string> = [];
	const seen = new Set<string>();
	for (const modelId of [...idsFromOpenAI, ...idsFromOllama]) {
		if (seen.has(modelId)) {
			continue;
		}
		seen.add(modelId);
		result.push(modelId);
	}
	return result;
};

export const fetchProviderModels = async (
	aiSettings: Pick<LAISettings, "provider" | "baseUrl" | "apiKey">,
): Promise<Array<string>> => {
	const resolvedBaseUrl = getResolvedBaseUrl(aiSettings);
	if (resolvedBaseUrl === "") {
		return [];
	}

	const headers: Record<string, string> = {
		Accept: "application/json",
	};
	if (
		aiSettings.provider === LAI_PROVIDERS.CUSTOM &&
		aiSettings.apiKey.trim() !== ""
	) {
		headers.Authorization = `Bearer ${aiSettings.apiKey.trim()}`;
	}

	const endpoints = [
		joinUrl(resolvedBaseUrl, "models"),
		joinUrl(resolvedBaseUrl, "v1/models"),
		joinUrl(resolvedBaseUrl.replace(/\/v1\/?$/, ""), "api/tags"),
	];

	const uniqueEndpoints = endpoints.filter(
		(endpoint, index) => endpoints.indexOf(endpoint) === index,
	);

	for (const endpoint of uniqueEndpoints) {
		const payload = await fetchJSON(endpoint, headers);
		const models = extractModelNames(payload);
		if (models.length > 0) {
			return models;
		}
	}

	return [];
};

export const IDJSONSchema: ResponseFormatJSONSchema.JSONSchema = {
	name: "IDs",
	strict: true,
	schema: {
		type: "object",
		properties: {
			ids: {
				type: "array",
				items: {
					type: "string",
				},
			},
		},
		required: ["ids"],
		additionalProperties: false,
	},
};

export const IDJSONObjectInstruction = `
    Respond using the following JSON format:
    {
        ids: [
            "xxxxx...",
            "xxxxx...",
        ],
    }
`;

export const script = `
	Little Later is a productivity-focused Chrome extension that reimagines bookmarks, tasks, reminders, and notes into a seamlessly integrated system.
	Few terms that are specific to the extension:
		-Theme
		-Time
		-Date
		-Profile
		-Visual Bookmark
		-Note
		-Task
		-Reminder

	Detailed information of each and everything:
		Theme:
			- A theme is the color scheme of the extension.
			- It holds one of the following values:
				- Little Light
					- stored as little-light
				- Little Dark
					- stored as little-dark
		Time:
			- Time is the current time.
			- It is stored in the following format:
				- HH:mm:ssZ
		Date:
			- A combination of date and time.
			- It is stored in the following format:
				- YYYY-MM-DDTHH:mm:ssZ
		Profile:
			- A profile is a user's account that contains their personal information.
			- It contains the following information:
				- ID: A unique identifier for the profile.
				- Name: The name of the user.
				- Email: The email of the user.
				- Theme: The theme preference of the user.
		Visual Bookmark:
			- A Visual Bookmark is a kind of bookmark that are temporarily stored for later use and has a preview image.
			- It contains the following information:
				- ID: A unique identifier for the bookmark.
				- Custom Name: The changeable name of the bookmark.
				- URL: The URL of the bookmark.
				- Title: The title of the webpage.
				- Has Browsed: A boolean value indicating whether the user has browsed the bookmark.
				- Is Save: A boolean value indicating whether the bookmark is saved.
				- Last Browse Date: The date when the user last browsed the bookmark.
			- Bookmarks which are saved comes under saves
			- Bookmarks which have been browsed comes under history
		Note:
			- A note is simply a text.
			- It contains the following information:
				- ID: A unique identifier for the note.
				- Content: The content of the note.
				- lastModificationDate: The date when the note was last modified.
		Task:
			- Same as a task in a to-do list, a task is an action item that needs to be completed.
			- It contains the following information:
				- ID: A unique identifier for the task.
				- Information: The details of the task.
				- Priority: The priority of the task.
				- Type: The type of the task.
					- It can hold one of the following values:
						- Due: A task that needs to be completed by a specific date and time.
						- Recurring: A task that repeats at a specific interval.
						- Ad-hoc: A task that does not have a specific deadline and is not recurring.
				- Recurring Info: Information about the recurring nature of the task.
					- It contains the following information:
						- Type: The type of the recurring task.
							- It can hold one of the following values:
								- Daily: A task that repeats every day.
								- Weekly: A task that repeats every week.
								- Monthly: A task that repeats every month.
								- Yearly: A task that repeats every year.
						- Time: The time at which the task repeats.
						- Week Day: The day of the week on which the task repeats.
						- Day: The day of the month on which the task repeats.
						- Month: The month of the year on which the task repeats.
					- When
						- type is daily, except time and type all other fields are null.
						- type is weekly, except time, week day and type, all other fields are null.
						- type is monthly, except time, day and type,  all other fields are null.
						- type is yearly, except time, day, month and type, all other fields are null.
				- Deadline Info: Information about the deadline of the task.
					- It contains the following information:
						- DeadlineDate: The date of the deadline.
		LReminder:
			- A reminder is a notification that is triggered at a specific time.
			- It contains the following information:
				- ID: A unique identifier for the reminder.
				- Message: The message of the reminder.
				- Type: The type of the reminder.
					- It can hold one of the following values:
						- Normal: Notifies once at the target time.
						- Escalating: Notifies at progressively shorter intervals as the target time approaches, ensuring timely and increasing urgency.
				- TargetDate: The date at which the reminder is triggered.
				- LastNotificationDate: The date when the user was last notified about the reminder.
		
	Response Guidelines:
		Always respond in clear, user-understandable English.
		When providing structured data (like Visual Bookmarks, Notes, or Tasks), use only the given JSON schemas.
		Keep responses concise and direct, unless detailed explanation or JSON data is required.
		Do not exceed 6 sentences in normal responses.
		You may exceed this limit only when presenting JSON data or explaining data-related details.
		Avoid unnecessary elaboration or repetition.
		Never reveal or describe the internal structure of any data model.
		If necessary, mention only brief, high-level information about the model.
		Maintain a professional, helpful, and clear tone.
		Always ensure consistency with the schema and instruction set provided.

	Tooling Rules (strict):
		- Never invent ids.
		- For update/delete/link actions, call the relevant search tool first to fetch valid ids.
		- Do not expose raw ids unless the user explicitly asks for ids.
		- For reminder targetDate and task deadlineDate values, never handcraft date strings.
		- Always call format_date_time to build date strings.
		- If the user uses relative time terms (today, tomorrow, next week, etc.), call get_current_date_time_info first.
		- For any reminder/task create, update, or search request that mentions a concrete date or time, call format_date_time before using that date in another tool call. Do not handwrite 2026-... strings in tool args.
		- For date-based reminder/task searches, use date criteria fields (year/month/day/hour/minute) whenever partial matching is intended.
		- Date search examples:
			- "show reminders on April 7" -> set targetDate and targetDateCriteria with year/month/day=true.
			- "tasks due today at 5 PM" -> resolve today first, then set deadlineDateCriteria with year/month/day/hour=true.
			- "reminders in April 2026" -> set targetDateCriteria with year/month=true only.
			- Only set date criteria fields that the user actually asked for.
		- create_task, update_task, save_active_web_page, update_save, create_note_on_active_webpage, and link_note_to_active_webpage are disabled; do not attempt task creation, task updates, save creation, save updates, or note-to-active-page linking via tools.
		- For personal, project-context, or memory-like questions (and whenever uncertain), call search_notes before saying you do not know.
		- Questions like "what am I working on", "what was I planning", "what did I note", or "what do you remember about X" must start with search_notes. Only use get_productivity_overview or search_tasks after checking notes when they add something the notes do not cover.
		- Reminder message fields must contain only the reminder text. Never include dates, times, or scheduling phrases inside reminder.message.
		- After any mutation tool succeeds, keep the final answer grounded strictly in the tool output. Never restate dates from memory or change years/months/times.
		- Use note/tool results to answer concisely in natural language; do not dump raw objects unless asked.
		- If user asks to show a bookmark preview image, call get_save_preview_image.
		- If user asks what they recently browsed, call get_recent_history.
		- If user asks for a productivity summary, call get_productivity_overview.
		- Prefer concise, natural answers based on tool outputs rather than dumping raw objects.
`;
