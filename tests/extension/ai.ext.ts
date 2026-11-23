import type { Page } from "@playwright/test";
import { configureAI, startProvider } from "./ai-provider";
import { createProfile, expect, test } from "./fixtures";
import {
	button,
	command,
	lock,
	openNote,
	rows,
	startVisitSite,
	type RecordId,
} from "./support";

// LittleAI lives in the side panel (decision 0017). Its page is opened as a
// tab here; the profile is unlocked in the popup page, as a person would.

const ask = async (panel: Page, text: string) => {
	const input = panel.getByRole("textbox", { name: "Ask Little AI" });
	await input.fill(text);
	await input.press("Enter");
};

const goHome = (page: Page) => page.goto(page.url().replace(/#.*$/, "#/home"));

test("the first prompt reaches the provider immediately and uses the loopback Origin", async ({
	openPopup,
	openPanel,
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
		// The popup's AI button is there once AI is set up.
		await goHome(home);
		await expect(button(home, "Open Little AI")).toBeVisible();
		const panel = await openPanel();
		await ask(panel, "First prompt immediately after opening");
		await expect(
			panel.getByText("Pong from the local fixture."),
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
	openPanel,
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
		const panel = await openPanel();
		await ask(panel, "Show a productivity overview");
		await expect(
			panel.getByText("Overview received from Little Later."),
		).toBeVisible();
		const toolResult = provider.requests
			.flatMap((request) => request.body.messages ?? [])
			.find((message) => message.role === "tool");
		expect(toolResult?.content).toMatch(/1 note|"total":1/);
		await expect(button(panel, "Confirm change")).toHaveCount(0);
	} finally {
		await provider.close();
	}
});

test("AI names the existing note and replacement, waits for confirmation, and cancel writes nothing", async ({
	openPopup,
	openPanel,
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
		const panel = await openPanel();
		await ask(panel, "Update the gardening note");
		await expect(button(panel, "Confirm change")).toBeVisible();
		await expect(
			panel.getByRole("listitem").filter({
				hasText: /Original gardening note.*New approved wording/,
			}),
		).toBeVisible();
		expect(await rows(page, "notes")).toEqual(original);
		await button(panel, "No, cancel").click();
		await expect(button(panel, "Confirm change")).toHaveCount(0);
		expect(await rows(page, "notes")).toEqual(original);
		// The conversation keeps what was asked, once the box is gone.
		const log = panel.getByRole("log", { name: "Conversation" });
		await expect(log.getByText("Asked for approval")).toBeVisible();
		await expect(
			log.getByRole("listitem").filter({
				hasText: /Original gardening note.*New approved wording/,
			}),
		).toBeVisible();

		await ask(panel, "Propose the note update again");
		await button(panel, "Confirm change").click();
		await expect(
			panel.getByText(/Updated note.*New approved wording/),
		).toBeVisible();
		await goHome(page);
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
	openPanel,
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
		const panel = await openPanel();
		await ask(panel, "Delete the undo sample");
		await expect(
			panel
				.getByRole("listitem")
				.filter({ hasText: /Delete.*Undo sample note/ }),
		).toBeVisible();
		await expect(button(panel, "Confirm delete")).toBeVisible();
		expect(await rows(page, "notes")).toHaveLength(1);
		await button(panel, "Confirm delete").click();
		await expect.poll(() => rows(page, "notes")).toHaveLength(0);
		await panel.getByRole("button", { name: /^Undo / }).click();
		await expect.poll(() => rows(page, "notes")).toHaveLength(1);
		await goHome(page);
		await openNote(page, "Undo sample note");
		await expect(
			page.getByText("Undo sample note", { exact: true }),
		).toBeVisible();
	} finally {
		await provider.close();
	}
});

test("asking without a configured provider reports an actionable failure", async ({
	openPopup,
	openPanel,
}) => {
	const home = await createProfile(openPopup);
	// No provider: the popup offers no AI button.
	await expect(button(home, "Open Little AI")).toHaveCount(0);
	const panel = await openPanel();
	await ask(panel, "A question without a provider");
	await expect(
		panel.getByText(/AI is not configured.*AI Settings/i),
	).toBeVisible();
});

// The run belongs to the worker: closing the panel doesn't stop it, and the
// answer is there when the panel opens again.
test("an answer arrives after the panel closes, and the chat reopens on it", async ({
	openPopup,
	openPanel,
}) => {
	const provider = await startProvider(() => ({
		content: "Answer written while the panel was closed.",
		delayMs: 2_500,
	}));
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const panel = await openPanel();
		await ask(panel, "Take your time");
		await expect(panel.getByRole("status")).toBeVisible();
		await panel.close();
		await expect
			.poll(() => rows(page, "chatMessages"), { timeout: 10_000 })
			.toHaveLength(2);
		const reopened = await openPanel();
		await expect(
			reopened.getByText("Answer written while the panel was closed."),
		).toBeVisible();
		// Picked up again: titled after its first message.
		await expect(
			reopened.getByRole("heading", { name: "Take your time" }),
		).toBeVisible();
	} finally {
		await provider.close();
	}
});

test("chats are listed, renamed and deleted from the history", async ({
	openPopup,
	openPanel,
}) => {
	const provider = await startProvider();
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const panel = await openPanel();
		await ask(panel, "Plan the garden");
		await expect(
			panel.getByText("Pong from the local fixture."),
		).toBeVisible();
		await button(panel, "New chat").click();
		await expect(
			panel.getByRole("textbox", { name: "Ask Little AI" }),
		).toBeVisible();
		await ask(panel, "Plan the trip");
		await expect(panel.getByText("Plan the trip")).toBeVisible();
		await expect.poll(() => rows(page, "chats")).toHaveLength(2);

		await button(panel, "Chats").click();
		const history = panel.getByRole("navigation", { name: "Chats" });
		await expect(history.getByText("Plan the garden")).toBeVisible();
		await button(history, "Rename Plan the garden").click();
		await history.getByLabel("Chat name").fill("Garden");
		await history.getByLabel("Chat name").press("Enter");
		await expect(
			history.getByText("Garden", { exact: true }),
		).toBeVisible();
		await button(history, "Delete chat Garden").click();
		await button(history, "Confirm delete chat Garden").click();
		await expect.poll(() => rows(page, "chats")).toHaveLength(1);
		await history.getByText("Plan the trip").click();
		await expect(
			panel.getByRole("heading", { name: "Plan the trip" }),
		).toBeVisible();
	} finally {
		await provider.close();
	}
});

test("the panel asks to unlock in the popup while the profile is locked", async ({
	openPopup,
	openPanel,
}) => {
	const page = await createProfile(openPopup);
	const panel = await openPanel();
	await expect(
		panel.getByRole("textbox", { name: "Ask Little AI" }),
	).toBeVisible();
	await lock(page);
	await expect(panel.getByText("Your profile is locked")).toBeVisible();
	await expect(button(panel, "Open Little Later")).toBeVisible();
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

test("a page attached with the chip is read and given to the model", async ({
	openPopup,
	openPanel,
	context,
}) => {
	const provider = await startProvider();
	const site = await startVisitSite();
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const web = await context.newPage();
		await web.goto(site.url + "/garden-notes");
		const panel = await openPanel();
		const chip = panel.getByRole("button", {
			name: "Use this page: Visit garden-notes",
		});
		await expect(chip).toBeVisible();
		await chip.click();
		await ask(panel, "What is this page about?");
		await expect(
			panel.getByText("Pong from the local fixture."),
		).toBeVisible();
		const sent = provider.requests
			.filter((request) => request.path === "/v1/chat/completions")
			.at(-1)!;
		const lastUser = [...(sent.body.messages ?? [])]
			.reverse()
			.find((message) => message.role === "user")!;
		expect(lastUser.content).toContain("What is this page about?");
		expect(lastUser.content).toContain("<attached_page");
		expect(lastUser.content).toContain("Visit garden-notes");
		// The message names the page it used.
		await expect(
			panel.getByRole("link", { name: "Visit garden-notes" }),
		).toBeVisible();
		// It was for that message: the next one reads nothing unless asked.
		await expect(
			panel.getByRole("button", {
				name: "Use this page: Visit garden-notes",
			}),
		).toBeVisible();
	} finally {
		await site.close();
		await provider.close();
	}
});

test("an attached page comes off when its tab moves to another page", async ({
	openPopup,
	openPanel,
	context,
}) => {
	const provider = await startProvider();
	const site = await startVisitSite();
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const web = await context.newPage();
		await web.goto(site.url + "/apple");
		const panel = await openPanel();
		await panel
			.getByRole("button", { name: "Use this page: Visit apple" })
			.click();
		await expect(
			panel.getByRole("button", { name: "Stop using Visit apple" }),
		).toBeVisible();
		await web.goto(site.url + "/pear");
		await expect(
			panel.getByRole("button", { name: "Use this page: Visit pear" }),
		).toBeVisible();
		await expect(
			panel.getByRole("button", { name: /^Stop using/ }),
		).toHaveCount(0);
	} finally {
		await site.close();
		await provider.close();
	}
});

test("the worker doesn't read a tab that has moved on from the attached page", async ({
	openPopup,
	openPanel,
	context,
	serviceWorker,
}) => {
	const provider = await startProvider();
	const site = await startVisitSite();
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const web = await context.newPage();
		await web.goto(site.url + "/pear");
		const tabId = await serviceWorker.evaluate(async (url) => {
			const [tab] = await chrome.tabs.query({ url });
			return tab.id!;
		}, site.url + "/pear");
		// Attached while the tab showed /apple; it shows /pear when read.
		await command(page, "ai.send", {
			chatId: null,
			text: "Summarize this page",
			page: { tabId, title: "Visit apple", url: site.url + "/apple" },
		});
		const panel = await openPanel();
		await expect(
			panel.getByText(/The page changed after you attached it/),
		).toBeVisible();
		expect(
			provider.requests.filter(
				(request) => request.path === "/v1/chat/completions",
			),
		).toHaveLength(0);
	} finally {
		await site.close();
		await provider.close();
	}
});

test("a run the worker loses when Chrome stops it is shown as interrupted", async ({
	openPopup,
	openPanel,
	stopServiceWorker,
	currentServiceWorker,
}) => {
	const provider = await startProvider(() => ({
		content: "Later answer",
		delayMs: 6_500,
	}));
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const panel = await openPanel();
		await ask(panel, "Please count to three");
		await expect
			.poll(
				() =>
					provider.requests.filter(
						(request) => request.path === "/v1/chat/completions",
					).length,
			)
			.toBe(1);
		await stopServiceWorker();
		await currentServiceWorker();
		await panel.reload();
		await expect(panel.getByText(/^Interrupted/)).toBeVisible();
		await expect(button(panel, "Regenerate")).toBeVisible();
	} finally {
		await provider.close();
	}
});

test("a readable export LittleAI was asked for is saved from the panel", async ({
	openPopup,
	openPanel,
}) => {
	const provider = await startProvider((request) =>
		request.body.messages?.at(-1)?.role === "tool"
			? { content: "Your export is ready." }
			: { tool: "export_data", args: { type: "readable" } },
	);
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const panel = await openPanel();
		await ask(panel, "Export my data as readable JSON");
		await expect(button(panel, "Confirm change")).toBeVisible();
		const download = panel.waitForEvent("download");
		await button(panel, "Confirm change").click();
		expect((await download).suggestedFilename()).toBe(
			"Little-Later-Readable.json",
		);
		await expect(panel.getByText(/createObjectURL/)).toHaveCount(0);
	} finally {
		await provider.close();
	}
});

test("the chats list takes the keyboard while open and gives it back", async ({
	openPopup,
	openPanel,
}) => {
	const page = await createProfile(openPopup);
	await command(page, "chat.create", { title: "Trip plans" });
	const panel = await openPanel();
	const chats = button(panel, "Chats");
	await chats.click();
	const list = panel.getByRole("navigation", { name: "Chats" });
	await expect(
		list.getByRole("searchbox", { name: "Search chats" }),
	).toBeFocused();
	// Tab stays in the list: nothing behind it can be reached.
	for (let press = 0; press < 4; press++) {
		await panel.keyboard.press("Tab");
		expect(
			await panel.evaluate(
				() =>
					document.activeElement === document.body ||
					Boolean(document.activeElement?.closest("nav")),
			),
		).toBe(true);
	}
	await panel.keyboard.press("Escape");
	await expect(list).toHaveCount(0);
	await expect(chats).toBeFocused();
});

test("a long chat opens at its latest messages and loads earlier ones on request", async ({
	openPopup,
	openPanel,
}) => {
	const page = await createProfile(openPopup);
	const { id: chatId } = await command<RecordId>(page, "chat.create", {
		title: "Long chat",
	});
	for (let turn = 1; turn <= 100; turn++) {
		await command(page, "chat.addMessage", {
			chatId,
			message: { role: "user", text: `Turn ${turn}` },
		});
	}
	const panel = await openPanel();
	const log = panel.getByRole("log", { name: "Conversation" });
	await expect(log.getByText("Turn 100", { exact: true })).toBeVisible();
	await expect(log.getByText("Turn 1", { exact: true })).toHaveCount(0);
	expect(await log.getByText(/^Turn \d+$/).count()).toBeLessThanOrEqual(50);
	// Scrolling to the top brings earlier messages in above, without
	// moving what is on screen.
	const firstShown = log.getByText("Turn 61", { exact: true });
	await log.evaluate((element) => element.scrollTo({ top: 0 }));
	const before = (await firstShown.boundingBox())!.y;
	await expect(log.getByText("Turn 50", { exact: true })).toBeAttached();
	await panel.waitForTimeout(200);
	expect(Math.abs((await firstShown.boundingBox())!.y - before)).toBeLessThan(
		2,
	);
	const showEarlier = button(panel, "Show earlier messages");
	await showEarlier.click();
	await expect(log.getByText("Turn 1", { exact: true })).toBeAttached();
	await expect(showEarlier).toHaveCount(0);
});

test("an edit the worker refuses leaves the question and answer in place", async ({
	openPopup,
	openPanel,
}) => {
	const provider = await startProvider();
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const panel = await openPanel();
		await ask(panel, "First question");
		await expect(
			panel.getByText("Pong from the local fixture."),
		).toBeVisible();
		const input = panel.getByRole("textbox", { name: "Ask Little AI" });
		await input.press("ArrowUp");
		await input.fill("x".repeat(100_001));
		await input.press("Enter");
		await expect(panel.getByText(/text must be 1 to/)).toBeVisible();
		await panel.reload();
		const log = panel.getByRole("log", { name: "Conversation" });
		await expect(log.getByText("First question")).toBeVisible();
		await expect(
			log.getByText("Pong from the local fixture."),
		).toBeVisible();
	} finally {
		await provider.close();
	}
});

test("the last message is edited with ↑, and an answer regenerated", async ({
	openPopup,
	openPanel,
}) => {
	const provider = await startProvider();
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const panel = await openPanel();
		await ask(panel, "Frist question");
		await expect(
			panel.getByText("Pong from the local fixture."),
		).toBeVisible();
		const input = panel.getByRole("textbox", { name: "Ask Little AI" });
		await input.press("ArrowUp");
		await expect(input).toHaveValue("Frist question");
		await expect(panel.getByText(/Editing your message/)).toBeVisible();
		await input.fill("First question");
		await input.press("Enter");
		await expect(
			panel.getByText("First question", { exact: true }),
		).toBeVisible();
		await expect(panel.getByText("Frist question")).toHaveCount(0);
		await expect.poll(() => rows(page, "chatMessages")).toHaveLength(2);

		const before = provider.requests.length;
		await button(panel, "Regenerate").click();
		await expect
			.poll(() => provider.requests.length)
			.toBeGreaterThan(before);
		await expect.poll(() => rows(page, "chatMessages")).toHaveLength(2);
		const last = provider.requests.at(-1)!.body.messages?.at(-1);
		expect(last?.content).toBe("First question");
	} finally {
		await provider.close();
	}
});

test("Enter that ends an IME composition doesn't send", async ({
	openPopup,
	openPanel,
}) => {
	const provider = await startProvider(() => ({ content: "Hello." }));
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const panel = await openPanel();
		const input = panel.getByRole("textbox", { name: "Ask Little AI" });
		await input.fill("にほんご");
		// The Enter that picks a word in a Japanese, Chinese or Korean IME.
		await input.dispatchEvent("keydown", {
			key: "Enter",
			isComposing: true,
		});
		await panel.waitForTimeout(300);
		await expect(input).toHaveValue("にほんご");
		expect(provider.requests).toHaveLength(0);
	} finally {
		await provider.close();
	}
});

test("a question from LittleAI is answered from the box above the input", async ({
	openPopup,
	openPanel,
}) => {
	const provider = await startProvider((request) =>
		request.body.messages?.at(-1)?.content === "Home"
			? { content: "Added milk to your Home list." }
			: {
					tool: "ask_user",
					args: {
						question: "Which list?",
						options: ["Work", "Home"],
					},
				},
	);
	try {
		const page = await createProfile(openPopup);
		await configureAI(page, provider.url);
		const panel = await openPanel();
		await ask(panel, "Add milk to my list");
		const box = panel.getByRole("region", { name: "Little AI's question" });
		const log = panel.getByRole("log", { name: "Conversation" });
		await expect(box.getByText("Which list?")).toBeVisible();
		// Asked once: in the box while it waits, not again above it.
		await expect(log.getByText("Which list?")).toHaveCount(0);
		await button(box, "Home").click();
		await expect(
			panel.getByText("Added milk to your Home list."),
		).toBeVisible();
		await expect(box).toHaveCount(0);
		await expect(log.getByText("Which list?")).toBeVisible();
	} finally {
		await provider.close();
	}
});
