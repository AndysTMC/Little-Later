import { describe, expect, it } from "vitest";
import {
	applyNoteFormatting,
	NoteFormattingAction,
} from "../../src/utils/noteFormatting";

const runAction = (
	content: string,
	action: NoteFormattingAction,
	start = 0,
	end = content.length,
) => applyNoteFormatting(content, { start, end }, action);

describe("note formatting helpers", () => {
	it("applies inline wrappers deterministically", () => {
		expect(runAction("hello", "bold").content).toBe("**hello**");
		expect(runAction("hello", "italic").content).toBe("_hello_");
		expect(runAction("hello", "underline").content).toBe("<u>hello</u>");
		expect(runAction("hello", "strikethrough").content).toBe("~~hello~~");
		expect(runAction("hello", "inlineCode").content).toBe("`hello`");
		expect(runAction("hello", "link").content).toBe(
			"[hello](https://example.com)",
		);
	});

	it("applies block transforms line-by-line", () => {
		expect(runAction("alpha\nbeta", "h1").content).toBe("# alpha\n# beta");
		expect(runAction("alpha\nbeta", "h2").content).toBe("## alpha\n## beta");
		expect(runAction("alpha\nbeta", "bullet").content).toBe("- alpha\n- beta");
		expect(runAction("alpha\nbeta", "numbered").content).toBe(
			"1. alpha\n2. beta",
		);
		expect(runAction("alpha\nbeta", "checklist").content).toBe(
			"- [ ] alpha\n- [ ] beta",
		);
		expect(runAction("alpha\nbeta", "quote").content).toBe("> alpha\n> beta");
	});

	it("wraps selected text in fenced code blocks", () => {
		const result = runAction("const x = 1;", "codeBlock");
		expect(result.content).toBe("```\nconst x = 1;\n```");
		expect(result.selection.start).toBeGreaterThan(0);
		expect(result.selection.end).toBeGreaterThan(result.selection.start);
	});

	it("normalizes invalid selection ranges safely", () => {
		const result = applyNoteFormatting(
			"hello world",
			{ start: 999, end: -4 },
			"bold",
		);
		expect(result.content).toContain("**");
		expect(result.selection.start).toBeGreaterThanOrEqual(0);
		expect(result.selection.end).toBeLessThanOrEqual(result.content.length);
	});
});
