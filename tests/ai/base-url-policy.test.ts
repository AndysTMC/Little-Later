import { describe, expect, it } from "vitest";
import { LAI_PROVIDERS } from "little-shared/enums";
import {
	getBaseUrlProblem,
	getResolvedBaseUrl,
} from "../../src/services/ai/config";

describe("custom AI base URL policy", () => {
	it("accepts https anywhere and http only on this computer", () => {
		expect(getBaseUrlProblem("https://api.example.com/v1")).toBeNull();
		expect(getBaseUrlProblem("http://localhost:8080/v1")).toBeNull();
		expect(getBaseUrlProblem("http://127.0.0.1:11434/v1")).toBeNull();
		expect(getBaseUrlProblem("http://[::1]:1234/v1")).toBeNull();
		expect(getBaseUrlProblem("")).toBeNull();
	});

	it("rejects plain http to other hosts and non-web schemes", () => {
		expect(getBaseUrlProblem("http://192.168.1.20:11434/v1")).toMatch(
			/https/,
		);
		expect(getBaseUrlProblem("http://localhost.evil.example/v1")).toMatch(
			/https/,
		);
		expect(getBaseUrlProblem("ftp://example.com")).not.toBeNull();
		expect(getBaseUrlProblem("not a url")).not.toBeNull();
	});

	it("never resolves to an insecure custom endpoint", () => {
		expect(
			getResolvedBaseUrl({
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "http://attacker.example/v1",
			}),
		).toBe("");
		expect(
			getResolvedBaseUrl({
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: " https://api.example.com/v1 ",
			}),
		).toBe("https://api.example.com/v1");
	});
});
