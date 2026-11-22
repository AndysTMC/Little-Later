// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	handToPage,
	listenForFiles,
	NoPageToSaveError,
} from "../../src/utils/saveFile";

// The worker has no page to save a file from; it hands the file to one
// open extension page (LittleAI's export, decision 0017).

const stops: Array<() => void> = [];
afterEach(() => {
	stops.splice(0).forEach((stop) => stop());
	vi.useRealTimers();
});

describe("a file from the worker", () => {
	it("is saved once, by the page the user is in", async () => {
		const inFocus = vi.fn();
		const behind = vi.fn();
		stops.push(listenForFiles(behind, () => false));
		stops.push(listenForFiles(inFocus, () => true));
		await handToPage(new Blob(["{}"]), "Little-Later-Readable.json");
		await vi.waitFor(() => expect(inFocus).toHaveBeenCalledTimes(1));
		expect(inFocus.mock.calls[0][1]).toBe("Little-Later-Readable.json");
		expect(await (inFocus.mock.calls[0][0] as Blob).text()).toBe("{}");
		await new Promise((resolve) => setTimeout(resolve, 400));
		expect(behind).not.toHaveBeenCalled();
	});

	it("is saved by a page without focus when no page has it", async () => {
		const save = vi.fn();
		stops.push(listenForFiles(save, () => false));
		await handToPage(new Blob(["x"]), "backup.lldat");
		await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
	});

	it("stops cleanly without throwing if unmounted while a delayed save is pending", async () => {
		const save = vi.fn();
		const stop = listenForFiles(save, () => false);
		const promise = handToPage(new Blob(["x"]), "backup.lldat");
		// Immediately unmount the listener before its unfocused delay fires.
		stop();
		// A second listener takes the handoff so handToPage finishes quickly.
		stops.push(listenForFiles(vi.fn(), () => true));
		await promise.catch(() => undefined);
		await new Promise((resolve) => setTimeout(resolve, 350));
		expect(save).not.toHaveBeenCalled();
	});

	it("fails, saying why, when no page is open", async () => {
		await expect(
			handToPage(new Blob(["x"]), "backup.lldat"),
		).rejects.toBeInstanceOf(NoPageToSaveError);
	}, 10_000);
});
