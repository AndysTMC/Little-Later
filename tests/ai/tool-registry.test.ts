import { describe, expect, it } from "vitest";
import { toolRegistry, tools } from "../../src/services/ai/toolRegistry";

describe("ai tool registry normalization", () => {
	it("registers the expected core tools", () => {
		expect(toolRegistry.has("create_note")).toBe(true);
		expect(toolRegistry.has("update_reminder")).toBe(true);
		expect(toolRegistry.has("search_tasks")).toBe(true);
		expect(toolRegistry.has("create_task")).toBe(false);
		expect(toolRegistry.has("update_task")).toBe(false);
		expect(toolRegistry.has("save_active_web_page")).toBe(false);
		expect(toolRegistry.has("update_save")).toBe(false);
		expect(toolRegistry.has("create_note_on_active_webpage")).toBe(false);
		expect(toolRegistry.has("link_note_to_active_webpage")).toBe(false);
	});

	it("maps update_reminder targetTS -> targetDate", () => {
		const definition = toolRegistry.get("update_reminder");
		expect(definition).toBeDefined();
		const args = definition!.normalizeArgs({
			id: "4",
			targetTS: "2026-04-05T09:00:00+05:30",
		});
		expect(args.id).toBe(4);
		expect(args.targetDate).toBe("2026-04-05T09:00:00+05:30");
	});

	it("marks invalid reminder datetime payloads", () => {
		const definition = toolRegistry.get("create_reminder");
		expect(definition).toBeDefined();
		const args = definition!.normalizeArgs({
			message: "Ping me",
			targetDate: "tomorrow morning",
		});
		expect(args.targetDate).toBeUndefined();
		expect(args.targetDateInvalid).toBe(true);
	});

	it("normalizes reminder date criteria filters", () => {
		const definition = toolRegistry.get("search_reminders");
		expect(definition).toBeDefined();
		const args = definition!.normalizeArgs({
			targetDate: "2026-04-05T18:30:00+05:30",
			targetDateCriteria: {
				year: true,
				month: true,
				day: true,
			},
		});
		expect(args.targetDate).toBe("2026-04-05T18:30:00+05:30");
		expect(args.targetDateCriteria).toMatchObject({
			year: true,
			month: true,
			day: true,
		});
	});

	it("keeps search filters optional", () => {
		const definition = toolRegistry.get("search_saves");
		expect(definition).toBeDefined();
		const args = definition!.normalizeArgs({});
		expect(args.query).toBeUndefined();
		expect(args.domain).toBeUndefined();
		expect(args.url).toBeUndefined();
	});

	it("registers datetime and preview helper tools", () => {
		expect(toolRegistry.has("format_date_time")).toBe(true);
		expect(toolRegistry.has("get_save_preview_image")).toBe(true);
		expect(toolRegistry.has("get_recent_history")).toBe(true);
		expect(toolRegistry.has("get_productivity_overview")).toBe(true);
	});

	it("does not expose removed save/task mutation tools to the model", () => {
		const toolNames = tools.map((tool) => tool.function.name);
		expect(toolNames).not.toContain("create_task");
		expect(toolNames).not.toContain("update_task");
		expect(toolNames).not.toContain("save_active_web_page");
		expect(toolNames).not.toContain("update_save");
		expect(toolNames).not.toContain("create_note_on_active_webpage");
		expect(toolNames).not.toContain("link_note_to_active_webpage");
	});
});
