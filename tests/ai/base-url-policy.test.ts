import { describe, expect, it } from "vitest";
import { LAI_PROVIDERS } from "little-shared/enums";
import {
	getBaseUrlProblem,
	getResolvedBaseUrl,
	isLocalOllamaUrl,
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

describe("local Ollama detection", () => {
	it("recognises Ollama's port on any loopback spelling", () => {
		expect(isLocalOllamaUrl("http://127.0.0.1:11434/v1")).toBe(true);
		expect(isLocalOllamaUrl("http://localhost:11434")).toBe(true);
		expect(isLocalOllamaUrl("http://[::1]:11434/v1")).toBe(true);
		expect(isLocalOllamaUrl("http://LOCALHOST:11434/v1")).toBe(true);
	});

	it("does not mistake other ports, hosts or text for Ollama", () => {
		expect(isLocalOllamaUrl("http://127.0.0.1:114340/v1")).toBe(false);
		expect(isLocalOllamaUrl("http://127.0.0.1:1234/v1")).toBe(false);
		expect(
			isLocalOllamaUrl("https://api.example.com/?via=localhost:11434"),
		).toBe(false);
		expect(isLocalOllamaUrl("http://192.168.1.20:11434/v1")).toBe(false);
		expect(isLocalOllamaUrl("")).toBe(false);
	});
});

// Where the assistant's data goes is a property of the model, not only the
// provider: Ollama serves cloud models through its local address too.
describe("where a model runs", () => {
	it("marks Ollama's cloud models, and only those", async () => {
		const { isCloudModel } = await import("../../src/services/ai/config");
		const { LAI_PROVIDERS } = await import("little-shared/enums");
		expect(isCloudModel(LAI_PROVIDERS.OLLAMA, "gpt-oss:120b-cloud")).toBe(
			true,
		);
		expect(isCloudModel(LAI_PROVIDERS.OLLAMA, "llama3.2:3b")).toBe(false);
		expect(isCloudModel(LAI_PROVIDERS.LM_STUDIO, "x-cloud")).toBe(false);
	});

	it("says where the messages and records go", async () => {
		const { describeProcessing } =
			await import("../../src/services/ai/config");
		const { LAI_PROVIDERS } = await import("little-shared/enums");
		const local = {
			provider: LAI_PROVIDERS.OLLAMA,
			baseUrl: "",
			model: "llama3.2",
		};
		expect(describeProcessing(local)).toContain("on this computer");
		// LM Studio can serve a local request from a linked remote machine.
		const lmStudio = describeProcessing({
			...local,
			provider: LAI_PROVIDERS.LM_STUDIO,
		});
		expect(lmStudio).not.toContain("stay here");
		expect(lmStudio).toContain("depends on your LM Studio setup");
		expect(
			describeProcessing({ ...local, model: "gemma4:31b-cloud" }),
		).toContain("Ollama's servers");
		expect(
			describeProcessing({
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "https://api.example.com/v1",
				model: "m",
			}),
		).toContain("api.example.com");
	});
});
