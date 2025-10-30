declare module "*.png" {
	const value: string;
}

declare namespace LanguageModel {
	function create(
		options?: LanguageModelCreateOptions,
	): Promise<LanguageModel>;

	function availability(
		options?: LanguageModelCreateCoreOptions,
	): Promise<Availability>;

	function params(): Promise<LanguageModelParams | null>;
}

declare namespace Rewriter {
	function create(options?: RewriterCreateOptions): Promise<Rewriter>;

	function availability(
		options?: RewriterCreateCoreOptions,
	): Promise<Availability>;
}

declare namespace Writer {
	function create(options?: WriterCreateOptions): Promise<Writer>;

	function availability(
		options?: WriterCreateCoreOptions,
	): Promise<Availability>;
}

declare namespace Summarizer {
	function create(options?: SummarizerCreateOptions): Promise<Summarizer>;

	function availability(
		options?: SummarizerCreateCoreOptions,
	): Promise<Availability>;
}
