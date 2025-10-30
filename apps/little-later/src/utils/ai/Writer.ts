// =====================================================
//  Writer WebIDL → TypeScript Translation
//  (Exposed=Window, SecureContext)
// =====================================================

import { CreateMonitorCallback, DestroyableModel } from "./common";

export interface Writer extends DestroyableModel {
	// ----------------
	// Instance Methods
	// ----------------

	write(input: string, options?: WriterWriteOptions): Promise<string>;

	writeStreaming(input: string, options?: WriterWriteOptions): ReadableStream;

	measureInputUsage(
		input: string,
		options?: WriterWriteOptions,
	): Promise<number>;

	// ----------------
	// Attributes
	// ----------------

	readonly sharedContext: string;
	readonly tone: WriterTone;
	readonly format: WriterFormat;
	readonly length: WriterLength;

	readonly expectedInputLanguages?: readonly string[];
	readonly expectedContextLanguages?: readonly string[];
	readonly outputLanguage?: string;

	readonly inputQuota: number;
}

// --------------------
// Options
// --------------------

export interface WriterCreateCoreOptions {
	tone?: WriterTone;
	format?: WriterFormat;
	length?: WriterLength;

	expectedInputLanguages?: string[];
	expectedContextLanguages?: string[];
	outputLanguage?: string;
}

export interface WriterCreateOptions extends WriterCreateCoreOptions {
	signal?: AbortSignal;
	monitor?: CreateMonitorCallback;
	sharedContext?: string;
}

export interface WriterWriteOptions {
	context?: string;
	signal?: AbortSignal;
}

// --------------------
// Enums
// --------------------

export type WriterTone = "formal" | "neutral" | "casual";
export type WriterFormat = "plain-text" | "markdown";
export type WriterLength = "short" | "medium" | "long";
