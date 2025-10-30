// =====================================================
//  LanguageModel WebIDL → TypeScript Translation
//  Compatible with Window (Exposed=Window, SecureContext)
// =====================================================

import { CreateMonitorCallback } from "./common";

export interface LanguageModel extends EventTarget {
	// -------- Static Methods --------
	// Modeled via namespace below (TypeScript pattern for WebIDL statics)

	prompt(
		input: LanguageModelPrompt,
		options?: LanguageModelPromptOptions,
	): Promise<string>;

	promptStreaming(
		input: LanguageModelPrompt,
		options?: LanguageModelPromptOptions,
	): ReadableStream;

	append(
		input: LanguageModelPrompt,
		options?: LanguageModelAppendOptions,
	): Promise<void>;

	measureInputUsage(
		input: LanguageModelPrompt,
		options?: LanguageModelPromptOptions,
	): Promise<number>;

	readonly inputUsage: number;
	readonly inputQuota: number;
	onquotaoverflow: ((this: LanguageModel, ev: Event) => unknown) | null;

	readonly topK: number;
	readonly temperature: number;

	clone(options?: LanguageModelCloneOptions): Promise<LanguageModel>;
	destroy(): void;
}

// =====================================================
// Supporting Types
// =====================================================

export interface LanguageModelParams {
	readonly defaultTopK: number;
	readonly maxTopK: number;
	readonly defaultTemperature: number;
	readonly maxTemperature: number;
}

// =====================================================
// Create Options
// =====================================================

export interface LanguageModelCreateCoreOptions {
	topK?: number;
	temperature?: number;

	expectedInputs?: LanguageModelExpected[];
	expectedOutputs?: LanguageModelExpected[];
	tools?: LanguageModelTool[];
}

export interface LanguageModelCreateOptions
	extends LanguageModelCreateCoreOptions {
	signal?: AbortSignal;
	monitor?: CreateMonitorCallback;
	initialPrompts?: LanguageModelMessage[];
}

export interface LanguageModelPromptOptions {
	responseConstraint?: Record<string, unknown>;
	omitResponseConstraintInput?: boolean;
	signal?: AbortSignal;
}

export interface LanguageModelAppendOptions {
	signal?: AbortSignal;
}

export interface LanguageModelCloneOptions {
	signal?: AbortSignal;
}

export interface LanguageModelExpected {
	type: LanguageModelMessageType;
	languages: string[];
}

// =====================================================
// Tool Definitions
// =====================================================

export type LanguageModelToolFunction = (...args: unknown[]) => Promise<string>;

export interface LanguageModelTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	execute: LanguageModelToolFunction;
}

// =====================================================
// Prompt & Message Definitions
// =====================================================

export type LanguageModelPrompt = LanguageModelMessage[] | string;

export interface LanguageModelMessage {
	role: LanguageModelMessageRole;
	content: string | LanguageModelMessageContent[];
	prefix?: boolean;
}

export interface LanguageModelMessageContent {
	type: LanguageModelMessageType;
	value: LanguageModelMessageValue;
}

export type LanguageModelMessageRole = "system" | "user" | "assistant";
export type LanguageModelMessageType = "text" | "image" | "audio";

export type LanguageModelMessageValue =
	| ImageBitmapSource
	| AudioBuffer
	| BufferSource
	| string;
