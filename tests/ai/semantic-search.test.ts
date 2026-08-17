import { describe, expect, it } from "vitest";
import {
	pickSemanticCandidates,
	quoteForPrompt,
	SEMANTIC_CANDIDATE_LIMIT,
} from "../../src/services/ai/toolCalls/_utils/semanticSearch";

describe("semantic search payload limits", () => {
	it("prefers lexical hits and never exceeds the candidate cap", () => {
		const all = Array.from({ length: 40 }, (_, index) => ({
			id: index + 1,
		}));
		const lexical = [{ id: 37 }, { id: 3 }];
		const candidates = pickSemanticCandidates(lexical, all);
		expect(candidates).toHaveLength(SEMANTIC_CANDIDATE_LIMIT);
		expect(candidates[0]?.id).toBe(37);
		expect(candidates[1]?.id).toBe(3);
		expect(new Set(candidates.map((item) => item.id)).size).toBe(
			SEMANTIC_CANDIDATE_LIMIT,
		);
	});

	it("escapes quotes so the query cannot break out of the prompt string", () => {
		expect(quoteForPrompt(`say "hello"`)).toBe('say \\"hello\\"');
	});
});
