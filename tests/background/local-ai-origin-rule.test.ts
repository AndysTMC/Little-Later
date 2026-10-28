import { describe, expect, it } from "vitest";
import {
	LOCAL_AI_ORIGIN_RULE_ID,
	buildLocalAIOriginRule,
} from "../../src/background/localAIOriginRule";

describe("local AI Origin rule", () => {
	it("only rewrites requests the extension itself starts", () => {
		const rule = buildLocalAIOriginRule(
			["11434", "1234"],
			"abcdefghijklmnop",
		);
		expect(rule.id).toBe(LOCAL_AI_ORIGIN_RULE_ID);
		expect(rule.condition.initiatorDomains).toEqual(["abcdefghijklmnop"]);
		expect(rule.action.requestHeaders).toEqual([
			{ header: "Origin", operation: "set", value: "http://127.0.0.1" },
		]);
	});

	it("matches only loopback hosts on the listed ports", () => {
		const rule = buildLocalAIOriginRule(["11434", "8080"], "ext");
		const filter = new RegExp(rule.condition.regexFilter ?? "");
		expect(filter.test("http://localhost:11434/api/chat")).toBe(true);
		expect(filter.test("http://127.0.0.1:8080/v1/models")).toBe(true);
		expect(filter.test("http://[::1]:11434/api/tags")).toBe(true);
		expect(filter.test("http://127.0.0.1:1234/v1/models")).toBe(false);
		expect(filter.test("http://evil.example:11434/")).toBe(false);
		expect(filter.test("http://localhost.evil.example:11434/")).toBe(false);
	});

	it("matches a loopback URL on its scheme's default port", () => {
		const rule = buildLocalAIOriginRule(["11434", ""], "ext");
		const filter = new RegExp(rule.condition.regexFilter ?? "");
		expect(filter.test("http://localhost/v1/models")).toBe(true);
		expect(filter.test("https://127.0.0.1/v1/models")).toBe(true);
		expect(filter.test("http://localhost:11434/api/chat")).toBe(true);
		expect(filter.test("http://localhost:8080/v1/models")).toBe(false);
		expect(filter.test("http://evil.example/v1/models")).toBe(false);
	});

	it("does not match default-port URLs unless asked to", () => {
		const rule = buildLocalAIOriginRule(["11434", "1234"], "ext");
		const filter = new RegExp(rule.condition.regexFilter ?? "");
		expect(filter.test("http://localhost/v1/models")).toBe(false);
	});
});
