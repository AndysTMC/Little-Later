import { describe, expect, it } from "vitest";
import {
	LOCAL_AI_ORIGIN_RULE_ID,
	buildLocalAIOriginRule,
} from "../../src/background/localAIOriginRule";

const filterFor = (endpoints: Array<string>): RegExp =>
	new RegExp(
		buildLocalAIOriginRule(
			endpoints.map((endpoint) => new URL(endpoint)),
			"ext",
		).condition.regexFilter ?? "",
	);

describe("local AI Origin rule", () => {
	it("only rewrites requests the extension itself starts", () => {
		const rule = buildLocalAIOriginRule(
			[new URL("http://127.0.0.1:11434/v1")],
			"abcdefghijklmnop",
		);
		expect(rule.id).toBe(LOCAL_AI_ORIGIN_RULE_ID);
		expect(rule.condition.initiatorDomains).toEqual(["abcdefghijklmnop"]);
		expect(rule.action.requestHeaders).toEqual([
			{ header: "Origin", operation: "set", value: "http://127.0.0.1" },
		]);
	});

	it("matches only the listed endpoints' origins", () => {
		const filter = filterFor([
			"http://127.0.0.1:11434/v1",
			"http://[::1]:8080/v1",
		]);
		expect(filter.test("http://127.0.0.1:11434/api/chat")).toBe(true);
		expect(filter.test("http://[::1]:8080/v1/models")).toBe(true);
		expect(filter.test("http://127.0.0.1:1234/v1/models")).toBe(false);
		expect(filter.test("https://127.0.0.1:11434/api/chat")).toBe(false);
		expect(filter.test("http://127.0.0.1:114340/api/chat")).toBe(false);
		expect(filter.test("http://127.0.0.1.evil.example:11434/")).toBe(false);
	});

	// Chrome matches the canonical request URL, which leaves out a default
	// port, however the endpoint was written in settings.
	it.each([
		["no port", "http://localhost/v1", "http://localhost/v1/models"],
		[
			"explicit :80",
			"http://localhost:80/v1",
			"http://localhost/v1/models",
		],
		["explicit :443", "https://127.0.0.1:443/v1", "https://127.0.0.1/v1"],
	])(
		"matches an endpoint on its default port (%s)",
		(_name, endpoint, url) => {
			const filter = filterFor([endpoint]);
			expect(filter.test(url)).toBe(true);
			expect(filter.test("http://localhost:8080/v1/models")).toBe(false);
		},
	);
});
