import { describe, expect, it } from "vitest";
import {
	getNoteCardTimeLabel,
	getNoteCardTitleAndSnippet,
} from "../../src/utils/notePreview";

describe("note preview helpers", () => {
	it("returns defaults for empty note content", () => {
		expect(getNoteCardTitleAndSnippet("   \n\n")).toEqual({
			title: "Untitled note",
			snippet: "Tap to add details.",
		});
	});

	it("derives clean title/snippet from markdown content", () => {
		const preview = getNoteCardTitleAndSnippet(
			"#   Launch Plan\n- [ ] Ship beta\n> Keep onboarding smooth",
		);
		expect(preview.title).toBe("Launch Plan");
		expect(preview.snippet).toContain("Ship beta");
		expect(preview.snippet).toContain("Keep onboarding smooth");
	});

	it("formats last modified label as compact month-day-time", () => {
		const label = getNoteCardTimeLabel("2026-04-05T17:35:00+05:30");
		expect(label).toMatch(/^[A-Za-z]{3}\s+\d{1,2}\s+\d{1,2}:\d{2}\s+(AM|PM)$/);
	});
});
