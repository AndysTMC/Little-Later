import type { Page } from "@playwright/test";
import { configureAI, startProvider } from "./ai-provider";
import { createProfile, expect, test } from "./fixtures";
import {
	button,
	command,
	openNote,
	rows,
	startVisitSite,
	type RecordId,
} from "./support";

const ask = async (page: Page, text: string) => {
	const input = page
		.getByRole("textbox", { name: "Ask AI" })
		.or(page.getByPlaceholder("Ask AI"));
	await input.fill(text);
	await input.press("Enter");
};

test("the first prompt reaches the provider immediately and uses the loopback Origin", async ({
	openPopup,
	serviceWorker,
}) => {
	const provider = await startProvider();
	try {
		const home = await createProfile(openPopup);
		await configureAI(home, provider.url);
		await expect
			.poll(() =>
				serviceWorker.evaluate(
					async (url) =>
						(
							await chrome.declarativeNetRequest.getDynamicRules()
						).some((rule) =>
							rule.condition.regexFilter?.includes(
								new URL(url).port,
							),
						),
					provider.url,
				),
			)
			.toBe(true);
		// Do not wait for anything other than the usable composer.
		await button(home, "Open AI Assist").click();
		await ask(home, "First prompt immediately after opening");
		await expect(
			home.getByText("Pong from the local fixture."),
		).toBeVisible();
		const chat = provider.requests.filter(
			(request) => request.path === "/v1/chat/completions",
		);
		expect(chat).toHaveLength(1);
		expect(chat[0].origin).toBe("http://127.0.0.1");
		expect(chat[0].body.messages?.at(-1)?.content).toBe(
			"First prompt immediately after opening",
		);
	} finally {
		await provider.close();
	}
});

test("a read tool returns the profile's live overview without asking for confirmation", async ({
	openPopup,
}) => {
	const provider = await startProvider((request) =>
		request.body.messages?.at(-1)?.role === "tool"
			? { content: "Overview received from Little Later." }
			: { tool: "get_productivity_overview", args: {} },
	);
	try {
		const page = await createProfile(openPopup);
		await command(page, "note.create", { content: "One real saved note" });
		await configureAI(page, provider.url);
		await button(page, "Open AI Assist").click();
		await ask(page, "Show a productivity overview");
		await expect(
			page.getByText("Overview received from Little Later."),
		).toBeVisible();
		const toolResult = provider.requests
			.flatMap((request) => request.body.messages ?? [])
			.find((message) => message.role === "tool");
		expect(toolResult?.content).toMatch(/1 note|"total":1/);
		await expect(button(page, "Confirm change")).toHaveCount(0);
	} finally {
		await provider.close();
	}
});

test("AI names the existing note and replacement, waits for confirmation, and cancel writes nothing", async ({
	openPopup,
}) => {
	let id: string;
	const provider = await startProvider(() => ({
		tool: "update_note",
		args: { id, content: "  New approved wording  " },
	}));
	try {
		const page = await createProfile(openPopup);
		({ id } = await command<RecordId>(page, "note.create", {
			content: "Original gardening note",
		}));
		const original = await rows(page, "notes");
		await configureAI(page, provider.url);
		await button(page, "Open AI Assist").click();
		await ask(page, "Update the gardening note");
		await expect(button(page, "Confirm change")).toBeVisible();
		await expect(
			page.getByRole("listitem").filter({
				hasText: /Original gardening note.*New approved wording/,
			}),
		).toBeVisible();
		expect(await rows(page, "notes")).toEqual(original);
		await button(page, "Cancel pending change").click();
		await expect(button(page, "Confirm change")).toHaveCount(0);
		expect(await rows(page, "notes")).toEqual(original);

		await ask(page, "Propose the note update again");
		await button(page, "Confirm change").click();
		await expect(
			page.getByText(/Updated note.*New approved wording/),
		).toBeVisible();
		await button(page, "Go back").click();
		await openNote(page, "New approved wording");
		await expect(
			page.getByText("New approved wording", { exact: true }),
		).toBeVisible();
	} finally {
		await provider.close();
	}
});

test("undo restores a note deleted in AI chat after confirmation", async ({
	openPopup,
}) => {
	let id: string;
	const provider = await startProvider(() => ({
		tool: "delete_note",
		args: { id },
	}));
	try {
		const page = await createProfile(openPopup);
		({ id } = await command<RecordId>(page, "note.create", {
			content: "Undo sample note",
		}));
		await configureAI(page, provider.url);
		await button(page, "Open AI Assist").click();
		await ask(page, "Delete the undo sample");
		await expect(
			page
				.getByRole("listitem")
				.filter({ hasText: /Delete.*Undo sample note/ }),
		).toBeVisible();
		await expect(button(page, "Confirm delete")).toBeVisible();
		expect(await rows(page, "notes")).toHaveLength(1);
		await button(page, "Confirm delete").click();
		await expect.poll(() => rows(page, "notes")).toHaveLength(0);
		await button(page, "Undo").click();
		await expect.poll(() => rows(page, "notes")).toHaveLength(1);
		await button(page, "Go back").click();
		await openNote(page, "Undo sample note");
		await expect(
			page.getByText("Undo sample note", { exact: true }),
		).toBeVisible();
	} finally {
		await provider.close();
	}
});

test("opening AI directly without a configured provider reports an actionable failure", async ({
	openPopup,
}) => {
	const home = await createProfile(openPopup);
	await expect(button(home, "Open AI Assist")).toHaveCount(0);
	const page = await openPopup("/ai");
	await ask(page, "A question without a provider");
	await expect(
		page.getByText(/AI is not configured.*AI Settings/i),
	).toBeVisible();
});

test("chat restores its route after reopen with an empty composer and no previous answer", async ({
	openPopup,
}) => {
	const provider = await startProvider();
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		await button(page, "Open AI Assist").click();
		await ask(page, "A finished conversation");
		await expect(
			page.getByText("Pong from the local fixture."),
		).toBeVisible();
		await page.getByPlaceholder("Ask AI").fill("Unsent second prompt");
		await page.close();
		const restored = await openPopup("/");
		await expect(restored).toHaveURL(/#\/ai$/);
		await expect(restored.getByPlaceholder("Ask AI")).toHaveValue("");
		await expect(
			restored.getByText("Pong from the local fixture."),
		).toHaveCount(0);
	} finally {
		await provider.close();
	}
});

test("a failed context-menu summary shows failure and saves no note", async ({
	openPopup,
	context,
	serviceWorker,
}) => {
	const provider = await startProvider(() => ({
		error: "The fixture refused this summary",
	}));
	const site = await startVisitSite();
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const web = await context.newPage();
		await web.goto(site.url + "/selection");
		const canDispatch = await serviceWorker.evaluate(
			() =>
				typeof (
					chrome.contextMenus.onClicked as unknown as {
						dispatch?: unknown;
					}
				).dispatch === "function",
		);
		expect(
			canDispatch,
			"Chromium's context-menu event can be dispatched in the worker",
		).toBe(true);
		await serviceWorker.evaluate(async (url) => {
			const [tab] = await chrome.tabs.query({ url });
			const event = chrome.contextMenus.onClicked as unknown as {
				dispatch: (
					info: { menuItemId: string; selectionText: string },
					tab: chrome.tabs.Tab,
				) => void;
			};
			event.dispatch(
				{
					menuItemId: "noteQuickSummary",
					selectionText: "Text selected on the local sample page",
				},
				tab,
			);
		}, web.url());
		await expect
			.poll(() =>
				provider.requests.some(
					(request) => request.path === "/v1/chat/completions",
				),
			)
			.toBe(true);
		await expect
			.poll(() =>
				serviceWorker.evaluate(async () =>
					Object.keys(await chrome.notifications.getAll()).some(
						(id) => id.startsWith("contextAction"),
					),
				),
			)
			.toBe(true);
		expect(await rows(page, "notes")).toHaveLength(0);
	} finally {
		await site.close();
		await provider.close();
	}
});
