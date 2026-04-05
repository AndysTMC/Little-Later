import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { resetLLDB } from "../../src/utils/db";
import { toolRegistry } from "../../src/services/ai/toolRegistry";

const aiContext = {
	ai: {
		getStructuredResponse: async () => ({ ids: [] }),
	},
};

describe.sequential("ai tool resilience", () => {
	beforeEach(async () => {
		await resetLLDB();
	});

	it("normalizes malformed payloads without throwing", () => {
		const malformedPayloads: Array<unknown> = [
			null,
			undefined,
			{ id: "abc", random: true },
			{ query: "test", limit: "7" },
			{ schedule: { type: "unknown" } },
		];

		for (const definition of toolRegistry.values()) {
			for (const payload of malformedPayloads) {
				expect(() =>
					definition.normalizeArgs(
						(payload ?? {}) as Record<string, unknown>,
					),
				).not.toThrow();
			}
		}
	});

	it("returns clear errors for missing required args on strict tools", async () => {
		const strictTools = [
			"create_note",
			"create_reminder",
			"delete_note",
			"update_note",
		] as const;

		for (const toolName of strictTools) {
			const definition = toolRegistry.get(toolName);
			expect(definition).toBeDefined();
			await expect(
				definition!.execute(definition!.normalizeArgs({}), aiContext),
			).rejects.toThrow(/required/i);
		}
	});
});
