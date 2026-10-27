import { describe, expect, it } from "vitest";
import { toSafeImageBlob } from "../../src/utils/safeImageBlob";

describe("toSafeImageBlob", () => {
	it("keeps raster image types", () => {
		for (const type of [
			"image/jpeg",
			"image/png",
			"image/webp",
			"image/gif",
		]) {
			const blob = new Blob([new Uint8Array([1, 2, 3])], { type });
			expect(toSafeImageBlob(blob)).toBe(blob);
		}
	});

	it("makes anything else opaque bytes so it cannot render as a page", async () => {
		for (const type of [
			"text/html",
			"image/svg+xml",
			"application/xhtml+xml",
			"",
		]) {
			const blob = new Blob(["<script>alert(1)</script>"], { type });
			const safe = toSafeImageBlob(blob);
			expect(safe.type).toBe("application/octet-stream");
			expect(safe.size).toBe(blob.size);
		}
	});
});
