import OpenAI from "openai";
import { LAI_PROVIDERS, LFACE_EXPRESSION } from "little-shared/enums";
import { LAIOutput } from "little-shared/types";
import { baseUrls, responseFormats, script } from "./config";
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
import { getLLConfig } from "../../utils/littleLocal";
import { localFetch } from "../../utils/littleLocal";
import { LRewriteOptions, LSummarizeOptions, LWriteOptions } from "../../types";
import { ResponseFormatJSONSchema } from "openai/resources.mjs";
import { getUserSettings } from "../settings";

export abstract class LittleAI {
	protected model: string;
	protected messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
	protected provider: LAI_PROVIDERS;
	protected apiKey: string;

	constructor({
		model,
		provider,
		apiKey,
	}: {
		model: string;
		provider: LAI_PROVIDERS;
		apiKey: string;
	}) {
		this.model = model;
		this.provider = provider;
		this.apiKey = apiKey;
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

	static getLAIAssistInstance = async (): Promise<LittleAI> => {
		const userSettings = await getUserSettings();
		const { ai: aiSettings } = userSettings;
		const { provider, model, apiKey } = aiSettings.assist;

		switch (provider) {
			case LAI_PROVIDERS.GROQ: {
				return new GroqAI({
					model,
					apiKey,
				});
			}
			default: {
				return new GroqAI({
					model,
					apiKey,
				});
			}
		}
	};

	static getLAIRephraseInstance = async (): Promise<LittleAI> => {
		const userSettings = await getUserSettings();
		const { ai: aiSettings } = userSettings;
		const { provider } = aiSettings.rephrase;
		if (provider === LAI_PROVIDERS.CHROME_AI) {
			return new ChromeAI();
		}
		const instance = await LittleAI.getLAIAssistInstance();
		return instance;
	};
	static getLAIGenerateInstance = async (): Promise<LittleAI> => {
		const userSettings = await getUserSettings();
		const { ai: aiSettings } = userSettings;
		const { provider } = aiSettings.generate;
		if (provider === LAI_PROVIDERS.CHROME_AI) {
			return new ChromeAI();
		}
		const instance = await LittleAI.getLAIAssistInstance();
		return instance;
	};
	static getLAISummarizeInstance = async (): Promise<LittleAI> => {
		const userSettings = await getUserSettings();
		const { ai: aiSettings } = userSettings;
		const { provider } = aiSettings.summarize;
		if (provider === LAI_PROVIDERS.CHROME_AI) {
			return new ChromeAI();
		}
		const instance = await LittleAI.getLAIAssistInstance();
		return instance;
	};
}

export class GroqAI extends LittleAI {
	constructor({ model, apiKey }: { model: string; apiKey: string }) {
		super({ model, provider: LAI_PROVIDERS.GROQ, apiKey });
	}

	async prompt(input: string): Promise<LAIOutput> {
		const api = new OpenAI({
			apiKey: this.apiKey,
			baseURL: baseUrls.get(this.provider),
			dangerouslyAllowBrowser: true,
		});

		const llConfig = await getLLConfig();

		const newMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
			role: "user",
			content: input,
		};

		this.messages.push(newMessage);

		let completion;

		try {
			if (llConfig.isEnabled) {
				const response = await localFetch(
					"/openai/v1/chat/completions",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: this.model,
							messages: this.messages,
							n: 1,
							tools: tools,
							tool_choice: "auto",
						}),
					},
				);
				if (response.response) {
					completion =
						(await response.response.json()) as OpenAI.Chat.Completions.ChatCompletion;
				} else {
					throw new Error("No response from local LLM");
				}
			} else {
				completion = await api.chat.completions.create({
					model: this.model,
					messages: this.messages,
					n: 1,
					tools: tools,
					tool_choice: "auto",
				});
			}
		} catch {
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
						await api.chat.completions.create({
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
					const theme = toolCalls.getUserAppThemePref();
					output.message = "Your app theme is " + theme;
					output.expression = LFACE_EXPRESSION.SLIGHTLY_SMILING;
					break;
				}
				case getUserNameTool.function.name: {
					const userName = toolCalls.getUserName();
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
		const api = new OpenAI({
			apiKey: this.apiKey,
			baseURL: baseUrls.get(this.provider),
			dangerouslyAllowBrowser: true,
		});

		const llConfig = await getLLConfig();

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
			if (llConfig.isEnabled) {
				const response = await localFetch(
					"/openai/v1/chat/completions",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: this.model,
							messages: messages,
							n: 1,
						}),
					},
				);
				if (response.response) {
					completion =
						(await response.response.json()) as OpenAI.Chat.Completions.ChatCompletion;
				} else {
					throw new Error("No response from local LLM");
				}
			} else {
				completion = await api.chat.completions.create({
					model: this.model,
					messages: messages,
					n: 1,
				});
			}
		} catch {
			return "Sorry, something went wrong. Please try again.";
		}

		return completion.choices[0].message.content || input;
	}

	async write(input: string, options?: LWriteOptions): Promise<string> {
		const api = new OpenAI({
			apiKey: this.apiKey,
			baseURL: baseUrls.get(this.provider),
			dangerouslyAllowBrowser: true,
		});

		const llConfig = await getLLConfig();

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
			if (llConfig.isEnabled) {
				const response = await localFetch(
					"/openai/v1/chat/completions",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: this.model,
							messages: messages,
							n: 1,
						}),
					},
				);
				if (response.response) {
					completion =
						(await response.response.json()) as OpenAI.Chat.Completions.ChatCompletion;
				} else {
					throw new Error("No response from local LLM");
				}
			} else {
				completion = await api.chat.completions.create({
					model: this.model,
					messages: messages,
					n: 1,
				});
			}
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
		const api = new OpenAI({
			apiKey: this.apiKey,
			baseURL: baseUrls.get(this.provider),
			dangerouslyAllowBrowser: true,
		});

		const llConfig = await getLLConfig();

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
				if (llConfig.isEnabled) {
					const response = await localFetch(
						"/openai/v1/chat/completions",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								model: this.model,
								messages: messages,
								n: 1,
								response_format: {
									type: "json_schema",
									json_schema: json_schema!,
								},
							}),
						},
					);
					if (response.response) {
						completion =
							(await response.response.json()) as OpenAI.Chat.Completions.ChatCompletion;
					} else {
						throw new Error("No response from local LLM");
					}
				} else {
					completion = await api.chat.completions.create({
						model: this.model,
						messages: messages,
						n: 1,
						response_format: {
							type: "json_schema",
							json_schema: json_schema!,
						},
					});
				}
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
				if (llConfig.isEnabled) {
					const response = await localFetch(
						"/openai/v1/chat/completions",
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								model: this.model,
								messages: messages,
								n: 1,
								response_format: {
									type: "json_object",
								},
							}),
						},
					);
					if (response.response) {
						completion =
							(await response.response.json()) as OpenAI.Chat.Completions.ChatCompletion;
					} else {
						throw new Error("No response from local LLM");
					}
				} else {
					completion = await api.chat.completions.create({
						model: this.model,
						messages: messages,
						n: 1,
						response_format: {
							type: "json_object",
						},
					});
				}
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
		const api = new OpenAI({
			apiKey: this.apiKey,
			baseURL: baseUrls.get(this.provider),
			dangerouslyAllowBrowser: true,
		});

		const llConfig = await getLLConfig();
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
			if (llConfig.isEnabled) {
				const response = await localFetch(
					"/openai/v1/chat/completions",
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							model: this.model,
							messages: messages,
							n: 1,
						}),
					},
				);
				if (response.response) {
					completion =
						(await response.response.json()) as OpenAI.Chat.Completions.ChatCompletion;
				} else {
					throw new Error("No response from local LLM");
				}
			} else {
				completion = await api.chat.completions.create({
					model: this.model,
					messages: messages,
					n: 1,
				});
			}
		} catch {
			return "Sorry, something went wrong. Please try again.";
		}

		return completion.choices[0].message.content || input;
	}
}

export class ChromeAI extends LittleAI {
	constructor() {
		super({ model: "", provider: LAI_PROVIDERS.CHROME_AI, apiKey: "" });
	}
	async prompt(): Promise<LAIOutput> {
		throw new Error("Method not implemented.");
	}
	async rewrite(input: string, options?: LRewriteOptions): Promise<string> {
		try {
			const rewriterAvailability = await Rewriter.availability();
			if (!rewriterAvailability.available) {
				await Rewriter.create();
			}
			const rewriter = await Rewriter.create({
				...(options ?? {}),
				expectedInputLanguages: ["en"],
				expectedContextLanguages: ["en"],
				outputLanguage: "en",
			});
			const rewrittenInput = await rewriter.rewrite(input);
			if (rewriter.destroy) {
				await rewriter.destroy();
			}
			return rewrittenInput;
		} catch (error) {
			console.log(error);
			return input;
		}
	}
	async write(input: string, options?: LWriteOptions): Promise<string> {
		try {
			const writerAvailability = await Writer.availability();
			if (!writerAvailability.available) {
				await Writer.create();
			}
			const writer = await Writer.create({
				...(options ?? {}),
				expectedInputLanguages: ["en"],
				expectedContextLanguages: ["en"],
				outputLanguage: "en",
			});
			const writtenInput = await writer.write(input);
			if (writer.destroy) {
				await writer.destroy();
			}
			return writtenInput;
		} catch (error) {
			console.log(error);
			return "";
		}
	}
	async getStructuredResponse(): Promise<unknown> {
		throw new Error("Method not implemented.");
	}
	async summarize(
		input: string,
		options?: LSummarizeOptions,
	): Promise<string> {
		try {
			const summarizerAvailability = await Summarizer.availability();
			if (!summarizerAvailability.available) {
				await Summarizer.create();
			}
			const summarizer = await Summarizer.create({
				...(options ?? {}),
				expectedInputLanguages: ["en"],
				expectedContextLanguages: ["en"],
				outputLanguage: "en",
			});
			const summary = await summarizer.summarize(input);
			if (summarizer.destroy) {
				await summarizer.destroy();
			}
			return summary;
		} catch (error) {
			console.log(error);
			return input;
		}
	}
}
