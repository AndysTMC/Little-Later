// =====================================================
//  Rewriter WebIDL → TypeScript Translation
//  (Exposed=Window, SecureContext)
// =====================================================

import { CreateMonitorCallback, DestroyableModel } from "./common";

export interface Rewriter extends DestroyableModel {
	// ----------------
	// Instance Methods
	// ----------------

	rewrite(input: string, options?: RewriterRewriteOptions): Promise<string>;

	rewriteStreaming(
		input: string,
		options?: RewriterRewriteOptions,
	): ReadableStream;

	measureInputUsage(
		input: string,
		options?: RewriterRewriteOptions,
	): Promise<number>;

	// ----------------
	// Attributes
	// ----------------
	readonly sharedContext: string;
	readonly tone: RewriterTone;
	readonly format: RewriterFormat;
	readonly length: RewriterLength;

	readonly expectedInputLanguages?: readonly string[];
	readonly expectedContextLanguages?: readonly string[];
	readonly outputLanguage?: string;

	readonly inputQuota: number;
}

// --------------------
// Options
// --------------------

export interface RewriterCreateCoreOptions {
	tone?: RewriterTone;
	format?: RewriterFormat;
	length?: RewriterLength;

	expectedInputLanguages?: string[];
	expectedContextLanguages?: string[];
	outputLanguage?: string;
}

export interface RewriterCreateOptions extends RewriterCreateCoreOptions {
	signal?: AbortSignal;
	monitor?: CreateMonitorCallback;
	sharedContext?: string;
}

export interface RewriterRewriteOptions {
	context?: string;
	signal?: AbortSignal;
}

// --------------------
// Enums
// --------------------

export type RewriterTone = "as-is" | "more-formal" | "more-casual";
export type RewriterFormat = "as-is" | "plain-text" | "markdown";
export type RewriterLength = "as-is" | "shorter" | "longer";
