import { CreateMonitorCallback, DestroyableModel } from "./common";

export interface Summarizer extends DestroyableModel {
	// ----------------
	// Instance Methods
	// ----------------

	summarize(
		input: string,
		options?: SummarizerSummarizeOptions,
	): Promise<string>;

	summarizeStreaming(
		input: string,
		options?: SummarizerSummarizeOptions,
	): ReadableStream;

	measureInputUsage(
		input: string,
		options?: SummarizerSummarizeOptions,
	): Promise<number>;

	// ----------------
	// Attributes
	// ----------------

	readonly sharedContext: string;
	readonly type: SummarizerType;
	readonly format: SummarizerFormat;
	readonly length: SummarizerLength;

	readonly expectedInputLanguages?: readonly string[];
	readonly expectedContextLanguages?: readonly string[];
	readonly outputLanguage?: string;

	readonly inputQuota: number;
}

// --------------------
// Options
// --------------------

export interface SummarizerCreateCoreOptions {
	type?: SummarizerType;
	format?: SummarizerFormat;
	length?: SummarizerLength;

	expectedInputLanguages?: string[];
	expectedContextLanguages?: string[];
	outputLanguage?: string;
}

export interface SummarizerCreateOptions extends SummarizerCreateCoreOptions {
	signal?: AbortSignal;
	monitor?: CreateMonitorCallback;
	sharedContext?: string;
}

export interface SummarizerSummarizeOptions {
	signal?: AbortSignal;
	context?: string;
}

// --------------------
// Enums
// --------------------

export type SummarizerType = "tldr" | "teaser" | "key-points" | "headline";
export type SummarizerFormat = "plain-text" | "markdown";
export type SummarizerLength = "short" | "medium" | "long";
