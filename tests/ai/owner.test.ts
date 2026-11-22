// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAI_PROVIDERS } from "little-shared/enums";
import {
	ProfileChangedError,
	currentOwner,
	type AIOwner,
} from "../../src/services/ai/owner";
import { OpenAICompatibleAI } from "../../src/services/ai/main";
import { toolRegistry } from "../../src/services/ai/toolRegistry";
import { littleDB } from "../../src/storage/pageDB";
import { send } from "../../src/utils/send";
import { freshProfile } from "./profile";

// AI work belongs to the profile it started in. Once another profile is
// open, it must not read that profile, write into it, or send anything to
// the first profile's provider.
describe("AI work after a profile switch", () => {
	let ownerA: AIOwner;

	beforeEach(async () => {
		await freshProfile();
		ownerA = await currentOwner();
		await send("note.create", { content: "A's note" });
		// Profile B is opened while A's request is still running.
		await send("profile.create", { name: "Bea", password: null });
		await send("note.create", { content: "B's private note" });
	});

	afterEach(() => vi.restoreAllMocks());

	it("cannot read the profile that is open now", async () => {
		await expect(ownerA.keys()).rejects.toBeInstanceOf(ProfileChangedError);
		const search = toolRegistry.get("search_notes")!;
		await expect(
			search.execute(search.normalizeArgs({ query: "note" }), {
				ai: { getStructuredResponse: async () => ({ ids: [] }) },
				owner: ownerA,
			}),
		).rejects.toBeInstanceOf(ProfileChangedError);
	});

	it("cannot write into the profile that is open now", async () => {
		await expect(
			ownerA.send("note.create", { content: "A's summary" }),
		).rejects.toThrow("The profile changed");
		const notes = await littleDB.notes.count();
		expect(notes).toBe(2);
	});

	it("sends nothing to the first profile's provider", async () => {
		const fetch = vi.spyOn(globalThis, "fetch");
		const ai = new OpenAICompatibleAI({
			owner: ownerA,
			model: "m",
			provider: LAI_PROVIDERS.CUSTOM,
			apiKey: "",
			baseUrl: "http://127.0.0.1:9/v1",
		});
		await expect(
			ai.summarize("B's private note", {
				type: "tldr",
				length: "short",
				format: "plain-text",
			}),
		).rejects.toBeInstanceOf(ProfileChangedError);
		expect(fetch).not.toHaveBeenCalled();
	});
});

// Locking ends the AI work started before it, even when the same profile
// is opened again at once: the work belongs to that unlock, not only to
// the profile.
describe("AI work after a lock and reopen of the same profile", () => {
	let owner: AIOwner;

	beforeEach(async () => {
		await freshProfile();
		owner = await currentOwner();
		const profileId = owner.profileId;
		await send("profile.lock", null);
		await send("profile.unlock", { profileId, password: null });
	});

	it("cannot read the profile again", async () => {
		await expect(owner.keys()).rejects.toBeInstanceOf(ProfileChangedError);
		await expect(owner.assertCurrent()).rejects.toBeInstanceOf(
			ProfileChangedError,
		);
	});

	it("cannot write into it", async () => {
		await expect(
			owner.send("note.create", { content: "Old summary" }),
		).rejects.toThrow("The profile changed");
		expect(await littleDB.notes.count()).toBe(0);
	});
});
