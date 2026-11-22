import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpfsStaging } from "../../src/storage/staging";

// A staged backup can be as large as the profile. Deleting one the page no
// longer needs must not read it: that pulled the whole file into memory.

const NAME = "0f8c2a3e-1b2c-4d5e-8f90-123456789abc";

const fakeDirectory = () => {
	const getFile = vi.fn(async () => new File([new Uint8Array(8)], NAME));
	const removeEntry = vi.fn(async (name: string) => {
		if (!files.has(name)) {
			throw new DOMException("gone", "NotFoundError");
		}
		files.delete(name);
	});
	const files = new Set([NAME]);
	const staging = {
		getFileHandle: async (name: string) => {
			if (!files.has(name)) {
				throw new DOMException("gone", "NotFoundError");
			}
			return { getFile };
		},
		removeEntry,
	};
	vi.stubGlobal("navigator", {
		storage: {
			getDirectory: async () => ({
				getDirectoryHandle: async () => staging,
			}),
		},
	});
	return { getFile, removeEntry, files };
};

afterEach(() => vi.unstubAllGlobals());

describe("discarding a staged file", () => {
	it("deletes it without reading it", async () => {
		const { getFile, files } = fakeDirectory();
		await createOpfsStaging().discard(NAME);
		expect(files.has(NAME)).toBe(false);
		expect(getFile).not.toHaveBeenCalled();
	});

	it("is quiet when the file is already gone", async () => {
		const { files } = fakeDirectory();
		files.clear();
		await expect(createOpfsStaging().discard(NAME)).resolves.toBe(
			undefined,
		);
	});
});
