// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentOwner } from "../../src/services/ai/owner";
import { getRecentHistoryToolCall } from "../../src/services/ai/toolCalls/getRecentHistory";
import { littleDB } from "../../src/storage/pageDB";
import { send } from "../../src/utils/send";
import { freshProfile } from "./profile";

// The model asks for a handful of recent pages; a profile may have
// thousands. Only the pages it gets back are opened.

const visit = async (url: string, at: number) => {
	vi.spyOn(Date, "now").mockReturnValue(at);
	const { id } = await send("save.capture", {
		url,
		title: url,
		saved: false,
	});
	return id;
};

beforeEach(async () => {
	await freshProfile();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("recent history for the model", () => {
	it("returns the newest visits, opening only those", async () => {
		for (let index = 0; index < 30; index += 1) {
			await visit(`https://site${index}.test/`, 1_000 + index);
		}
		// Saved but taken out of history: not a visit any more.
		const removed = await visit("https://site.test/removed", 5_000);
		await send("save.update", { id: removed, saved: true, browsed: false });
		vi.restoreAllMocks();

		const owner = await currentOwner();
		await owner.keys();
		// One site per visit: history keeps only a few visits per site.
		expect(await littleDB.saves.count()).toBe(31);
		const decrypt = vi.spyOn(crypto.subtle, "decrypt");
		const history = await getRecentHistoryToolCall(owner, 3);

		expect(history.map((save) => save.url)).toEqual([
			"https://site29.test/",
			"https://site28.test/",
			"https://site27.test/",
		]);
		expect(decrypt.mock.calls.length).toBeLessThanOrEqual(3);
	});
});
