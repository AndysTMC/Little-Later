import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import type { Locator, Page, Worker } from "@playwright/test";
import { expect, sendCommand } from "./fixtures";

export const button = (page: Page | Locator, name: string | RegExp) =>
	page.getByRole("button", { name, exact: typeof name === "string" });

export type TestFile = { name: string; mimeType: string; buffer: Buffer };

// The shared upload screen (/pick-file) takes files by paste or drop; a
// toolbar popup closes when a system file window opens, so it has no file
// input. These hand it files the way Chrome does, once the screen is
// there: its address changes before the previous page has finished leaving.
export const giveFiles = async (
	page: Page,
	files: ReadonlyArray<TestFile>,
	how: "paste" | "drop" = "paste",
) => {
	await expect(page.getByTestId("upload-area")).toBeVisible();
	await page.evaluate(
		({ files, how }) => {
			const transfer = new DataTransfer();
			for (const file of files) {
				const bytes = Uint8Array.from(atob(file.base64), (char) =>
					char.charCodeAt(0),
				);
				transfer.items.add(
					new File([bytes], file.name, { type: file.mimeType }),
				);
			}
			if (how === "paste") {
				document.dispatchEvent(
					new ClipboardEvent("paste", {
						bubbles: true,
						clipboardData: transfer,
					}),
				);
			} else {
				document
					.querySelector("[data-testid='upload-area']")
					?.dispatchEvent(
						new DragEvent("drop", {
							bubbles: true,
							cancelable: true,
							dataTransfer: transfer,
						}),
					);
			}
		},
		{
			how,
			files: files.map((file) => ({
				name: file.name,
				mimeType: file.mimeType,
				base64: file.buffer.toString("base64"),
			})),
		},
	);
};

// Pastes files on the upload screen, waits for each to be listed, and
// hands them back to the screen that asked.
export const upload = async (page: Page, files: ReadonlyArray<TestFile>) => {
	await expect(page).toHaveURL(/#\/pick-file\?/);
	await giveFiles(page, files);
	for (const file of files) {
		await expect(
			page
				.getByTestId("upload-area")
				.getByText(file.name, { exact: true }),
		).toBeVisible();
	}
	await button(page, "Upload").click();
	await expect(page).not.toHaveURL(/#\/pick-file\?/);
};

export const tab = (page: Page, name: string) =>
	page.getByRole("tab", { name, exact: true });

// LUISelectT1 renders a segmented control (radiogroup) below its caption.
export const option = (page: Page, field: string, choice: string) =>
	page
		.getByText(field, { exact: true })
		.locator("../..")
		.getByRole("radio", { name: choice, exact: true });

// A settings dropdown (LUISelectT2), named "<setting>: <choice>, change".
export const dropdown = (page: Page, setting: string) =>
	page.getByRole("button", { name: new RegExp(`^${setting}: `) });

export const choose = async (page: Page, setting: string, choice: string) => {
	await dropdown(page, setting).click();
	await page.getByRole("option", { name: choice, exact: true }).click();
	await expect(dropdown(page, setting)).toHaveAccessibleName(
		`${setting}: ${choice}, change`,
	);
};

export const command = async <T = void>(
	page: Page,
	name: string,
	input: unknown,
): Promise<T> => {
	const result = await sendCommand(page, name, input);
	if (!result.ok) throw new Error(name + ": " + result.error.message);
	return result.value as T;
};

export type RecordId = { id: string };

type Row = Record<string, unknown> & RecordId;

// Read through the extension origin. Keep the raw bytes for assertions
// against the actual stored row, with no application-side decryption.
export const rows = <T extends Row = Row>(
	page: Page,
	table: string,
): Promise<T[]> =>
	page.evaluate(
		(store) =>
			new Promise<T[]>((resolve, reject) => {
				const open = indexedDB.open("little");
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const db = open.result;
					const transaction = db.transaction(store);
					const request = transaction.objectStore(store).getAll();
					transaction.oncomplete = () => db.close();
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						resolve(
							request.result.map(
								(row: Row) =>
									Object.fromEntries(
										Object.entries(row).map(
											([key, value]) => [
												key,
												value instanceof Uint8Array
													? Array.from(value)
													: value,
											],
										),
									) as T,
							),
						);
					};
				};
			}),
		table,
	);

// What the popup remembered, gathered from its "ui:" keys (src/popup/uiState.ts).
export const uiState = (worker: Worker) =>
	worker.evaluate(async () => {
		const stored = await chrome.storage.session.get(null);
		const drafts: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(stored)) {
			if (key.startsWith("ui:draft:")) drafts[key.slice(9)] = value;
		}
		return { route: stored["ui:route"] ?? null, drafts };
	});

export const forgetUIState = (worker: Worker) =>
	worker.evaluate(async () => {
		const keys = await chrome.storage.session.getKeys();
		await chrome.storage.session.remove(
			keys.filter((key) => key.startsWith("ui:")),
		);
	});

export const unlock = async (page: Page, name: string, password?: string) => {
	await button(page, "Open profile " + name).click();
	if (password !== undefined) {
		await page.getByLabel("Password", { exact: true }).fill(password);
		await button(page, "Unlock").click();
	}
	await expect(page.getByRole("tablist")).toBeVisible();
};

export const lock = async (page: Page) => {
	await button(page, "Open profile menu").click();
	await button(page, "Lock").click();
	await expect(page).toHaveURL(/#\/lock$/);
	await button(page, "Lock").click();
	await expect(page.getByText("Choose Profile")).toBeVisible();
};

export const openNote = async (page: Page, title: string) => {
	await tab(page, "Notes").click();
	await button(page, "Open note: " + title).click();
	await expect(page).toHaveURL(/#\/note\//);
};

export const seedSave = (page: Page, title: string, saved = true) =>
	command<RecordId>(page, "save.capture", {
		url: "http://127.0.0.1/" + encodeURIComponent(title),
		title,
		saved,
	});

export const seedTask = (page: Page, information: string) =>
	command<RecordId>(page, "task.create", {
		information,
		label: "",
		priority: "medium",
		schedule: { kind: "anytime" },
	});

export const seedReminder = (
	page: Page,
	message: string,
	target = Date.now() + 3_600_000,
) =>
	command<RecordId>(page, "reminder.create", {
		message,
		target,
		escalate: false,
	});

export type LocalServer = { url: string; close: () => Promise<void> };

export async function startLocalServer(
	listener: RequestListener,
): Promise<LocalServer> {
	const server = createServer(listener);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const { port } = server.address() as AddressInfo;
	return {
		url: "http://127.0.0.1:" + port,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.closeAllConnections();
				server.close((error) => (error ? reject(error) : resolve()));
			}),
	};
}

export const startVisitSite = () =>
	startLocalServer((request, response) => {
		const title =
			"Visit " +
			(request.url?.split("/").at(-1) || "home").replace(
				/[^a-zA-Z0-9-]/g,
				"",
			);
		response.setHeader("Content-Type", "text/html; charset=utf-8");
		response.end(
			"<title>" + title + "</title><main><h1>" + title + "</h1></main>",
		);
	});
