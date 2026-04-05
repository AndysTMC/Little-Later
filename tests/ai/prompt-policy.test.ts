import { describe, expect, it } from "vitest";
import { script } from "../../src/services/ai/config";

describe("ai prompt policy", () => {
	it("requires notes lookup before fallback for uncertain contextual questions", () => {
		expect(script).toContain(
			"For personal, project-context, or memory-like questions (and whenever uncertain), call search_notes before saying you do not know.",
		);
	});

	it("keeps date construction rule enforced", () => {
		expect(script).toContain("Always call format_date_time to build date strings.");
		expect(script).toContain(
			"If the user uses relative time terms (today, tomorrow, next week, etc.), call get_current_date_time_info first.",
		);
		expect(script).toContain(
			'Date search examples:',
		);
		expect(script).toContain(
			'"show reminders on April 7" -> set targetDate and targetDateCriteria with year/month/day=true.',
		);
		expect(script).toContain(
			"create_task, update_task, save_active_web_page, update_save, create_note_on_active_webpage, and link_note_to_active_webpage are disabled; do not attempt task creation, task updates, save creation, save updates, or note-to-active-page linking via tools.",
		);
	});
});
