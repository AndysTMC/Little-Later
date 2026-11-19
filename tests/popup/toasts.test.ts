import { afterEach, describe, expect, it } from "vitest";
import { LTOAST_TYPE } from "little-shared/enums";
import { createToast, deleteToast, getToasts } from "../../src/services/toasts";

afterEach(() => localStorage.clear());

// Each toast change reads the list and writes it back; two at once used
// to lose one.
describe("toasts", () => {
	it("keeps every toast made at the same time", async () => {
		await Promise.all([
			createToast("first", LTOAST_TYPE.INFO),
			createToast("second", LTOAST_TYPE.ERROR),
			createToast("third", LTOAST_TYPE.SUCCESS),
		]);
		expect((await getToasts()).map((toast) => toast.message)).toEqual([
			"first",
			"second",
			"third",
		]);
	});

	it("removes one while another is being made", async () => {
		await createToast("old", LTOAST_TYPE.INFO);
		const [old] = await getToasts();
		await Promise.all([
			deleteToast(old.id),
			createToast("new", LTOAST_TYPE.INFO),
		]);
		expect((await getToasts()).map((toast) => toast.message)).toEqual([
			"new",
		]);
	});
});
