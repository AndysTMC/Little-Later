import OpenAI from "openai";
import { LAI_PROVIDERS, LFACE_EXPRESSION } from "little-shared/enums";
import { LAIOutput } from "little-shared/types";
import {
	getResolvedBaseUrl,
	isAISettingsConfigured,
	responseFormats,
	script,
} from "./config";
import tools, {
	createNoteOnActiveWebpageTool,
	createNoteTool,
	createReminderTool,
	createTaskTool,
	deleteNoteTool,
	deleteReminderTool,
	deleteSaveTool,
	deleteTaskTool,
	exportDataTool,
	getCurrentDateTimeInfoTool,
	getUserAppThemePrefTool,
	getUserNameTool,
	linkNoteToActiveWebpageTool,
	saveActiveWebPageTool,
	searchNotesTool,
	searchRemindersTool,
	searchSavesTool,
	searchTasksTool,
	setUserAppThemePrefTool,
	updateNoteTool,
	updateReminderTool,
	updateSaveTool,
	updateTaskTool,
} from "./tools";
import toolCalls from "./toolCalls";
import { LRewriteOptions, LSummarizeOptions, LWriteOptions } from "../../types";
import { ResponseFormatJSONSchema } from "openai/resources.mjs";
import { getUserSettings } from "../settings";

export abstract class LittleAI {
	protected model: string;
	protected messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
	protected provider: LAI_PROVIDERS;
	protected apiKey: string;
	protected baseUrl: string;

	constructor({
		model,
		provider,
		apiKey,
		baseUrl,
	}: {
		model: string;
		provider: LAI_PROVIDERS;
		apiKey: string;
		baseUrl: string;
	}) {
		this.model = model;
		this.provider = provider;
		this.apiKey = apiKey;
		this.baseUrl = baseUrl;
		this.messages = [
			{
				role: "system",
				content: script,
			},
		];
	}

	abstract prompt(input: string): Promise<LAIOutput>;

	abstract rewrite(input: string, options?: LRewriteOptions): Promise<string>;

	abstract write(input: string, options?: LWriteOptions): Promise<string>;

	abstract summarize(
		input: string,
		options?: LSummarizeOptions,
	): Promise<string>;

	abstract getStructuredResponse(
		prompt: string,
		jsonSchema?: ResponseFormatJSONSchema.JSONSchema,
		jsonObjectSchema?: string,
	): Promise<unknown>;

	clear() {
		this.messages = [
			{
				role: "system",
				content: script,
			},
		];
	}

	protected get shouldUseHeaderlessFetch(): boolean {
		return this.apiKey.trim() === "";
	}

	protected async createChatCompletion(
		params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
	): Promise<OpenAI.Chat.Completions.ChatCompletion> {
		if (!this.shouldUseHeaderlessFetch) {
			const api = new OpenAI({
				apiKey: this.apiKey,
				baseURL: this.baseUrl,
				dangerouslyAllowBrowser: true,
			});
			return await api.chat.completions.create(params);
		}

		const response = await fetch(
			`${this.baseUrl.replace(/\/+$/, "")}/chat/completions`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(params),
			},
		);

		if (!response.ok) {
			throw new Error(`LLM request failed with status ${response.status}`);
		}

		return (await response.json()) as OpenAI.Chat.Completions.ChatCompletion;
	}

	static getLAIAssistInstance = async (): Promise<LittleAI> => {
		const userSettings = await getUserSettings();
		const { ai: aiSettings } = userSettings;
		const { provider, model, apiKey } = aiSettings;
		const normalizedBaseUrl = getResolvedBaseUrl(aiSettings);
		const normalizedApiKey = apiKey.trim();

		if (!isAISettingsConfigured(aiSettings)) {
			return new OpenAICompatibleAI({
				model: "",
				provider,
				apiKey: normalizedApiKey,
				baseUrl: normalizedBaseUrl,
			});
		}

		return new OpenAICompatibleAI({
			model,
			provider,
			apiKey: normalizedApiKey,
			baseUrl: normalizedBaseUrl,
		});
	};

	static getLAIRephraseInstance = async (): Promise<LittleAI> => {
		return LittleAI.getLAIAssistInstance();
	};
	static getLAIGenerateInstance = async (): Promise<LittleAI> => {
		return LittleAI.getLAIAssistInstance();
	};
	static getLAISummarizeInstance = async (): Promise<LittleAI> => {
		return LittleAI.getLAIAssistInstance();
	};
}

export class OpenAICompatibleAI extends LittleAI {
	constructor({
		model,
		apiKey,
		provider,
		baseUrl,
	}: {
		model: string;
		apiKey: string;
		provider: LAI_PROVIDERS;
		baseUrl: string;
	}) {
		super({ model, provider, apiKey, baseUrl });
	}

	async prompt(input: string): Promise<LAIOutput> {
		if (this.model.trim() === "" || this.baseUrl.trim() === "") {
			return {
				message:
					"AI is not configured yet. Please set provider, base URL, and model in AI Settings.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}

		const newMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
			role: "user",
			content: input,
		};

		this.messages.push(newMessage);

		let completion;

		try {
			completion = await this.createChatCompletion({
				model: this.model,
				messages: this.messages,
				n: 1,
				tools: tools,
				tool_choice: "auto",
			});
		} catch (error: unknown) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			if (errorMessage.includes("403")) {
				return {
					message:
						"AI provider rejected the request (403). Check API key in AI Settings, or clear it for local providers.",
					actions: [],
					expression: LFACE_EXPRESSION.FROWNING,
				};
			}
			return {
				message: "Sorry, something went wrong. Please try again.",
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			};
		}

		const output: LAIOutput = {
			message:
				completion.choices[0].message.content ||
				"Sorry, I can't assist with that.",
			actions: [],
			expression: LFACE_EXPRESSION.FROWNING,
		};

		if (
			completion.choices[0].message.tool_calls &&
			completion.choices[0].message.tool_calls.length > 0
		) {
			const functionName =
				completion.choices[0].message.tool_calls[0].function.name;
			const functionArgs = JSON.parse(
				completion.choices[0].message.tool_calls[0].function.arguments,
			);
			const toolCallId = completion.choices[0].message.tool_calls[0].id;
			switch (functionName) {
				case createNoteTool.function.name: {
					try {
						const action = await toolCalls.createNote(
							functionArgs["content"],
						);
						output.message =
							"Are you sure you want to create the note?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case createNoteOnActiveWebpageTool.function.name: {
					try {
						const action =
							await toolCalls.createNoteOnActiveWebpage(
								functionArgs["content"],
							);
						output.message =
							"Are you sure you want to create the note on the current webpage?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case createReminderTool.function.name: {
					try {
						const action = await toolCalls.createReminder({
							message: functionArgs["message"],
							targetDate: functionArgs["targetDate"],
							type: functionArgs["type"],
						});
						output.message =
							"Are you sure you want to create the reminder?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case createTaskTool.function.name: {
					try {
						const action = await toolCalls.createTask({
							information: functionArgs["information"],
							label: functionArgs["label"],
							priority: functionArgs["priority"],
							schedule: functionArgs["schedule"],
						});
						output.message =
							"Are you sure you want to create the task?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case deleteNoteTool.function.name: {
					const action = await toolCalls.deleteNote({
						id: functionArgs["id"],
					});
					output.message =
						"Are you sure you want to delete the note?";
					output.actions = [action];
					output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					break;
				}
				case deleteReminderTool.function.name: {
					const action = await toolCalls.deleteReminder({
						id: functionArgs["id"],
					});
					output.message =
						"Are you sure you want to delete the reminder?";
					output.actions = [action];
					output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					break;
				}
				case deleteSaveTool.function.name: {
					const action = await toolCalls.deleteSave({
						id: functionArgs["id"],
					});
					output.message =
						"Are you sure you want to delete the save?";
					output.actions = [action];
					output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					break;
				}
				case deleteTaskTool.function.name: {
					const action = await toolCalls.deleteTask({
						id: functionArgs["id"],
					});
					output.message =
						"Are you sure you want to delete the task?";
					output.actions = [action];
					output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					break;
				}
				case exportDataTool.function.name: {
					try {
						const action = await toolCalls.exportData({
							type: functionArgs["type"],
						});
						output.message =
							"Are you sure you want to export the data?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case getCurrentDateTimeInfoTool.function.name: {
					const dateTimeInfo = toolCalls.getCurrentDataTimeInfo();
					this.messages.push({
						role: "tool",
						tool_call_id: toolCallId,
						content: dateTimeInfo,
					});
					const followUpCompletion =
						await this.createChatCompletion({
							model: this.model,
							messages: this.messages,
							n: 1,
						});
					output.message =
						followUpCompletion.choices[0].message.content ||
						"Can't assist.";
					output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					break;
				}
				case getUserAppThemePrefTool.function.name: {
					const theme = await toolCalls.getUserAppThemePref();
					output.message = "Your app theme is " + theme;
					output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					break;
				}
				case getUserNameTool.function.name: {
					const userName = await toolCalls.getUserName();
					output.message = "Your name is " + userName;
					output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					break;
				}
				case linkNoteToActiveWebpageTool.function.name: {
					try {
						const action = await toolCalls.linkNoteToActiveWebpage(
							functionArgs["id"],
						);
						output.message =
							"Are you sure you want to link the note to the current webpage?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case saveActiveWebPageTool.function.name: {
					try {
						const action = await toolCalls.saveActiveWebPage();
						output.message =
							"Are you sure you want to save the current webpage?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case searchNotesTool.function.name: {
					try {
						const notes = await toolCalls.searchNotes(
							this,
							functionArgs["query"],
						);
						if (notes.length === 0) {
							output.message = "No notes found.";
						} else {
							output.message = `Below ${notes.length === 1 ? "is the note" : "are the notes"} related/associated with your query.`;
							output.content = {
								saves: [],
								reminders: [],
								tasks: [],
								notes: notes,
							};
							output.expression =
								LFACE_EXPRESSION.SLIGHTLY_SMILING;
						}
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case searchRemindersTool.function.name: {
					try {
						const reminders = await toolCalls.searchReminders(
							this,
							{
								...functionArgs,
							},
						);
						if (reminders.length === 0) {
							output.message = "No reminders found.";
						} else {
							output.message = `Below ${reminders.length === 1 ? "is the reminder" : "are the reminders"} related/associated with your query.`;
							output.content = {
								saves: [],
								reminders: reminders,
								tasks: [],
								notes: [],
							};
							output.expression =
								LFACE_EXPRESSION.SLIGHTLY_SMILING;
						}
					} catch (error: unknown) {
						output.message = (error as Error).message;
						output.expression = LFACE_EXPRESSION.FROWNING;
					}
					break;
				}
				case searchSavesTool.function.name: {
					try {
						const saves = await toolCalls.searchSaves(this, {
							...functionArgs,
						});
						if (saves.length === 0) {
							output.message = "No saves found.";
						} else {
							output.message = `Below ${saves.length === 1 ? "is the save" : "are the saves"} related/associated with your query.`;
							output.content = {
								saves: saves,
								reminders: [],
								tasks: [],
								notes: [],
							};
							output.expression =
								LFACE_EXPRESSION.SLIGHTLY_SMILING;
						}
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case searchTasksTool.function.name: {
					try {
						const tasks = await toolCalls.searchTasks(this, {
							...functionArgs,
						});
						if (tasks.length === 0) {
							output.message = "No tasks found.";
						} else {
							output.message = `Below ${tasks.length === 1 ? "is the task" : "are the tasks"} related/associated with your query.`;
							output.content = {
								saves: [],
								reminders: [],
								tasks: tasks,
								notes: [],
							};
							output.expression =
								LFACE_EXPRESSION.SLIGHTLY_SMILING;
						}
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case setUserAppThemePrefTool.function.name: {
					try {
						const action = await toolCalls.setUserAppThemePref({
							...functionArgs,
						});
						output.message =
							"Are you sure you want to change your theme to " +
							functionArgs.theme +
							"?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case updateNoteTool.function.name: {
					try {
						const action = await toolCalls.updateNote(
							functionArgs["id"],
							functionArgs["content"],
						);
						output.message =
							"Are you sure you want to update the note?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case updateReminderTool.function.name: {
					try {
						const action = await toolCalls.updateReminder(
							functionArgs["id"],
							{
								message: functionArgs["message"],
								type: functionArgs["type"],
								targetDate: functionArgs["targetDate"],
							},
						);
						output.message =
							"Are you sure you want to update the reminder?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case updateSaveTool.function.name: {
					try {
						const action = await toolCalls.updateSave(
							functionArgs["id"],
							functionArgs["name"],
						);
						output.message =
							"Are you sure you want to update the save?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
				case updateTaskTool.function.name: {
					try {
						const action = await toolCalls.updateTask(
							functionArgs["id"],
							{
								information: functionArgs["information"],
								label: functionArgs["label"],
								priority: functionArgs["priority"],
								schedule: functionArgs["schedule"],
							},
						);
						output.message =
							"Are you sure you want to update the task?";
						output.actions = [action];
						output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					} catch (error: unknown) {
						output.message = (error as Error).message;
					}
					break;
				}
			}
		}
		output.message = await this.rewrite(output.message, {
			tone: "more-formal",
			format: "plain-text",
			length: "shorter",
		});
		return output;
	}

	async rewrite(input: string, options?: LRewriteOptions): Promise<string> {
		if (this.model.trim() === "" || this.baseUrl.trim() === "") {
			return input;
		}
		const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
			{
				role: "system",
				content: `
					You are an expert rewriter. Rewrite the user's input based on the following options:
					Tone: ${options?.tone || "as-is"}
					Format: ${options?.format || "as-is"}
					Length: ${options?.length || "as-is"}
					${options?.sharedContext ? `Context: ${options.sharedContext}` : ""}
				`,
			},
			{
				role: "user",
				content: input,
			},
		];

		let completion;

		try {
			completion = await this.createChatCompletion({
				model: this.model,
				messages: messages,
				n: 1,
			});
		} catch {
			return "Sorry, something went wrong. Please try again.";
		}

		return completion.choices[0].message.content || input;
	}

	async write(input: string, options?: LWriteOptions): Promise<string> {
		if (this.model.trim() === "" || this.baseUrl.trim() === "") {
			return "";
		}
		const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
			{
				role: "system",
				content: `
					You are an expert AI Content Generator. Generate the content based on user's input with the following requirements:
					Tone: ${options?.tone || "as-is"}
					Format: ${options?.format || "as-is"}
					Length: ${options?.length || "as-is"}
					${options?.sharedContext ? `Context: ${options.sharedContext}` : ""}
				`,
			},
			{
				role: "user",
				content: input,
			},
		];

		let completion;

		try {
			completion = await this.createChatCompletion({
				model: this.model,
				messages: messages,
				n: 1,
			});
		} catch {
			return "Sorry, something went wrong. Please try again.";
		}

		return completion.choices[0].message.content || "";
	}

	async getStructuredResponse(
		prompt: string,
		json_schema?: ResponseFormatJSONSchema.JSONSchema,
		json_object_instruction?: string,
	): Promise<unknown> {
		if (this.model.trim() === "" || this.baseUrl.trim() === "") {
			return JSON.parse("{}");
		}
		let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
		let completion: OpenAI.Chat.Completions.ChatCompletion;

		if (responseFormats.get(this.provider) === "json_schema") {
			messages = [
				{
					role: "user",
					content: prompt,
				},
			];

			try {
				completion = await this.createChatCompletion({
					model: this.model,
					messages: messages,
					n: 1,
					response_format: {
						type: "json_schema",
						json_schema: json_schema!,
					},
				});
			} catch {
				return JSON.parse("{}");
			}
		} else {
			messages = [
				{
					role: "user",
					content: `
						${prompt}

						${json_object_instruction}
					`,
				},
			];
			try {
				completion = await this.createChatCompletion({
					model: this.model,
					messages: messages,
					n: 1,
					response_format: {
						type: "json_object",
					},
				});
			} catch {
				return JSON.parse("{}");
			}
		}

		return JSON.parse(completion.choices[0].message.content || "{}");
	}

	async summarize(
		input: string,
		options?: LSummarizeOptions,
	): Promise<string> {
		if (this.model.trim() === "" || this.baseUrl.trim() === "") {
			return input;
		}
		const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
			{
				role: "system",
				content: `
					You are an expert summarizer. Summarize the user's input based on the following options:
					Type: ${options?.type || "tldr"}
					Format: ${options?.format || "as-is"}
					Length: ${options?.length || "as-is"}
					${options?.sharedContext ? `Context: ${options.sharedContext}` : ""}
				`,
			},
			{
				role: "user",
				content: input,
			},
		];
		let completion;
		try {
			completion = await this.createChatCompletion({
				model: this.model,
				messages: messages,
				n: 1,
			});
		} catch {
			return "Sorry, something went wrong. Please try again.";
		}

		return completion.choices[0].message.content || input;
	}
}

