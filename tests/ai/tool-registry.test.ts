import { describe, expect, it } from "vitest";
import {
	toolRegistry,
	toolRequiresConfirmation,
	tools,
} from "../../src/services/ai/toolRegistry";

describe("ai tool registry normalization", () => {
	it("registers the expected core tools", () => {
		expect(toolRegistry.has("create_note")).toBe(true);
		expect(toolRegistry.has("update_reminder")).toBe(true);
		expect(toolRegistry.has("search_tasks")).toBe(true);
		expect(toolRegistry.has("create_task")).toBe(true);
		expect(toolRegistry.has("update_task")).toBe(true);
		expect(toolRegistry.has("save_active_web_page")).toBe(true);
		expect(toolRegistry.has("update_save")).toBe(true);
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
		expect(args.id).toBe("4");
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

	it("exposes confirmed save/task mutation tools and keeps page-link tools disabled", () => {
		const toolNames = tools.map((tool) => tool.function.name);
		expect(toolNames).toContain("create_task");
		expect(toolNames).toContain("update_task");
		expect(toolNames).toContain("save_active_web_page");
		expect(toolNames).toContain("update_save");
		expect(toolNames).not.toContain("create_note_on_active_webpage");
		expect(toolNames).not.toContain("link_note_to_active_webpage");
	});

	it("requires confirmation for writes and not for reads", () => {
		expect(toolRequiresConfirmation("search_notes")).toBe(false);
		expect(toolRequiresConfirmation("get_user_name")).toBe(false);
		expect(toolRequiresConfirmation("create_task")).toBe(true);
		expect(toolRequiresConfirmation("update_task")).toBe(true);
		expect(toolRequiresConfirmation("save_active_web_page")).toBe(true);
		expect(toolRequiresConfirmation("update_save")).toBe(true);
		expect(toolRequiresConfirmation("delete_task")).toBe(true);
		expect(toolRequiresConfirmation("export_data")).toBe(true);
		expect(toolRequiresConfirmation("unknown_tool")).toBe(false);
	});

	it("normalizes create/update task and save arguments", () => {
		const createTask = toolRegistry.get("create_task");
		const updateTask = toolRegistry.get("update_task");
		const updateSave = toolRegistry.get("update_save");
		expect(createTask).toBeDefined();
		expect(updateTask).toBeDefined();
		expect(updateSave).toBeDefined();

		expect(
			createTask!.normalizeArgs({
				information: "  Pay rent  ",
				label: " Rent ",
				deadlineDate: "2026-04-08T08:00:00+05:30",
			}),
		).toMatchObject({
			information: "Pay rent",
			label: "Rent",
			deadlineDate: "2026-04-08T08:00:00+05:30",
			deadlineDateInvalid: false,
		});

		expect(
			updateTask!.normalizeArgs({
				id: "12",
				deadlineDate: "soon",
			}),
		).toMatchObject({
			id: "12",
			deadlineDate: undefined,
			deadlineDateInvalid: true,
		});

		expect(
			updateSave!.normalizeArgs({
				id: 47,
				name: "  Streaming Home  ",
			}),
		).toMatchObject({
			// Ids are strings; a model that writes a number still finds the record.
			id: "47",
			customName: "Streaming Home",
		});
	});
});
