import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	UIStateContext,
	type UIStateStore,
} from "../../src/popup/contexts/UIStateContext";
import { pickKey, type PickedFile } from "../../src/popup/filePick";
import { LUIImportProfile } from "../../src/popup/pages/LUIImportProfile/Page";
import { staging } from "../../src/storage/staging";

const mocks = vi.hoisted(() => ({
	importBackup: vi.fn(),
}));
vi.mock("../../src/services/backup", () => ({
	importBackup: mocks.importBackup,
}));
vi.mock("../../src/services/toasts", () => ({ createToast: vi.fn() }));
vi.mock("../../src/popup/hooks/useTheme", () => ({
	useTheme: () => ({ theme: "little-light", accent: "mono" }),
}));

let root: Root;
let container: HTMLDivElement;

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	mocks.importBackup.mockReset();
});

const store = (): UIStateStore => {
	const drafts = new Map<string, unknown>();
	return {
		getDraft: (key) => drafts.get(key),
		setDraft: (key, value) => void drafts.set(key, value),
		clearDraft: (key) => void drafts.delete(key),
		clearDrafts: () => {},
		rememberRoute: () => {},
	};
};

const typePassword = async (value: string) => {
	const input = container.querySelector<HTMLInputElement>(
		"input[aria-label='Backup password']",
	)!;
	const setValue = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	await act(async () => {
		setValue?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
};

const pressImport = async () => {
	const button = Array.from(container.querySelectorAll("button")).find(
		(element) => element.textContent?.includes("Import"),
	)!;
	await act(async () => button.click());
	await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};

// One backup imports and one fails. Retrying used to import the first one
// again, making a second copy of its profile.
describe("importing several backups", () => {
	it("retries only the files that failed", async () => {
		const ui = store();
		const files: Array<PickedFile> = [];
		for (const name of ["good.lldat", "bad.lldat"]) {
			files.push({
				file: await staging.put(new Uint8Array([1, 2, 3])),
				type: "application/octet-stream",
				name,
				size: 3,
			});
		}
		ui.setDraft(pickKey("backup.import"), files);
		const imported: Array<number> = [];
		mocks.importBackup.mockImplementation(async (blob: Blob) => {
			imported.push(blob.size);
			if (imported.length === 2) {
				throw new Error("This backup is damaged.");
			}
			return { skippedLinks: 0 };
		});

		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		await act(async () =>
			root.render(
				<UIStateContext.Provider value={ui}>
					<MemoryRouter>
						<LUIImportProfile />
					</MemoryRouter>
				</UIStateContext.Provider>,
			),
		);
		await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
		await typePassword("secret");
		await pressImport();
		expect(mocks.importBackup).toHaveBeenCalledTimes(2);
		expect(container.textContent).toContain("bad.lldat");
		expect(container.textContent).not.toContain("good.lldat");

		mocks.importBackup.mockResolvedValue({ skippedLinks: 0 });
		await pressImport();
		// Only bad.lldat is tried again.
		expect(mocks.importBackup).toHaveBeenCalledTimes(3);
	});
});
