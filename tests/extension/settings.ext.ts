import { startProvider } from "./ai-provider";
import { createProfile, expect, test } from "./fixtures";
import { accentColorOf, accentPalette } from "../../src/appearance";
import { button, choose, command, dropdown, rows } from "./support";

const rgbOf = (hex: string) =>
	`rgb(${[1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(", ")})`;

test("a profile name typed just before leaving is saved", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "Open profile menu").click();
	await button(page, "Profile").click();
	await page
		.getByPlaceholder("Name", { exact: true })
		.fill("Renamed in a hurry");
	await button(page, "Go back").click();
	await expect(page).toHaveURL(/#\/home$/);
	await expect
		.poll(() => rows(page, "profiles"))
		.toMatchObject([{ name: "Renamed in a hurry" }]);
	await button(page, "Open profile menu").click();
	await button(page, "Profile").click();
	await expect(page.getByPlaceholder("Name", { exact: true })).toHaveValue(
		"Renamed in a hurry",
	);
});

test("history limits changed immediately before Back survive leaving Settings", async ({
	openPopup,
}) => {
	const home = await createProfile(openPopup);
	await button(home, "Open profile menu").click();
	await button(home, "Settings").click();
	await button(home, "Misc").click();
	const inputs = home.getByRole("textbox", { name: "Numeric value" });
	await inputs.nth(0).fill("1250");
	await inputs.nth(1).fill("7");
	await button(home, "Go back").click();
	await expect(home).toHaveURL(/#\/settings$/);
	await button(home, "Misc").click();
	await expect(inputs.nth(0)).toHaveValue("1250");
	await expect(inputs.nth(1)).toHaveValue("7");
});

test("System theme follows color scheme emulation and stays selected after reopen", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await page.emulateMedia({ colorScheme: "light" });
	await expect(button(page, "Switch to dark theme")).toBeVisible();
	await page.emulateMedia({ colorScheme: "dark" });
	await expect(button(page, "Switch to light theme")).toBeVisible();
	await button(page, "Open profile menu").click();
	await button(page, "Settings").click();
	await button(page, "Appearance").click();
	await expect(dropdown(page, "Theme")).toHaveAccessibleName(
		"Theme: System, change",
	);
	await choose(page, "Theme", "Little Light");
	await expect
		.poll(() => rows(page, "profiles"))
		.toMatchObject([{ prefs: { theme: "light" } }]);
	await choose(page, "Theme", "System");
	await expect
		.poll(() => rows(page, "profiles"))
		.toMatchObject([{ prefs: { theme: "system" } }]);
	await page.close();
	const restored = await openPopup("/");
	await expect(restored).toHaveURL(/#\/settings\/appearance$/);
	await expect(dropdown(restored, "Theme")).toHaveAccessibleName(
		"Theme: System, change",
	);
});

test("custom provider edits and a long API key survive immediate navigation", async ({
	openPopup,
}) => {
	const provider = await startProvider();
	try {
		const page = await createProfile(openPopup);
		await command(page, "settings.update", {
			ai: {
				provider: "Custom",
				baseUrl: provider.url + "/v1",
				apiKey: "",
				model: "before",
			},
		});
		await button(page, "Open profile menu").click();
		await button(page, "Settings").click();
		await button(page, "AI").click();
		const key = "test-value-" + "0123456789".repeat(280);
		const apiKey = page.getByPlaceholder("API Key (Custom provider only)", {
			exact: true,
		});
		await page.getByPlaceholder("Model", { exact: true }).fill("after");
		await apiKey.fill(key);
		await button(page, "Go back").click();
		await expect(page).toHaveURL(/#\/settings$/);
		await button(page, "AI").click();
		await expect(apiKey).toHaveValue(key);
		await expect(
			page.getByPlaceholder("Model", { exact: true }),
		).toHaveValue("after");
		expect(provider.requests).toHaveLength(0);
		await page.close();
		const restored = await openPopup("/");
		await expect(restored).toHaveURL(/#\/settings\/ai$/);
		await expect(
			restored.getByPlaceholder("API Key (Custom provider only)", {
				exact: true,
			}),
		).toHaveValue(key);
	} finally {
		await provider.close();
	}
});

test("typing a custom URL sends nothing until Load models is pressed", async ({
	openPopup,
}) => {
	const provider = await startProvider();
	try {
		const page = await createProfile(openPopup);
		await command(page, "settings.update", {
			ai: { provider: "Custom", baseUrl: "", apiKey: "", model: "" },
		});
		await button(page, "Open profile menu").click();
		await button(page, "Settings").click();
		await button(page, "AI").click();
		await page.clock.install();
		const base = page.getByLabel("Base URL");
		await base.fill(provider.url);
		await page.clock.runFor(1000);
		expect(provider.requests).toHaveLength(0);
		await base.fill(provider.url + "/v1");
		await page.clock.runFor(1000);
		expect(provider.requests).toHaveLength(0);
		await button(page, "Load models").click();
		await page.clock.runFor(1000);
		await expect(
			page.getByText("fixture-model", { exact: true }),
		).toBeVisible();
		expect(
			provider.requests
				.filter((entry) => entry.method === "GET")
				.map((entry) => entry.path),
		).toEqual(["/v1/models"]);
	} finally {
		await provider.close();
	}
});

test("a profile name typed just before the popup closes is kept and saved", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "Open profile menu").click();
	await button(page, "Profile").click();
	const nameInput = page.getByPlaceholder("Name", { exact: true });
	await expect(nameInput).toBeVisible();
	await page.clock.install({ time: Date.now() });
	await nameInput.fill("Close right away");
	await page.close();
	const reopened = await openPopup("/");
	await expect(reopened).toHaveURL(/#\/profile$/);
	await expect(button(reopened, "Add a profile photo")).toBeVisible();
	await expect(
		reopened.getByPlaceholder("Name", { exact: true }),
	).toHaveValue("Close right away", { timeout: 2_000 });
});

test("an accent chosen in Appearance colours the whole popup and stays after reopen", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	await page.emulateMedia({ colorScheme: "light" });
	await button(page, "Open profile menu").click();
	await button(page, "Settings").click();
	await button(page, "Appearance").click();
	const greenColor = accentColorOf("green", null)!;
	const palette = accentPalette(greenColor, false)!;
	const rgb = rgbOf;
	const look = (target: typeof page) =>
		target.evaluate(() => {
			const root = document.getElementById("root")!;
			const title = document.querySelector("h1")!;
			return {
				accent: root.style.getPropertyValue("--ll-accent"),
				page: getComputedStyle(root).backgroundColor,
				text: getComputedStyle(title).color,
			};
		});
	const green = {
		accent: greenColor,
		page: rgb(palette["--color-white"]),
		text: rgb(palette["--color-black"]),
	};

	// The swatch, as a person clicks it.
	await page.getByTitle("Green").click();
	await expect
		.poll(() => rows(page, "profiles"))
		.toMatchObject([{ prefs: { accent: "green" } }]);
	await expect.poll(() => look(page)).toEqual(green);
	await expect(page.getByRole("radio", { name: "Green" })).toBeChecked();

	await page.close();
	const reopened = await openPopup("/");
	await reopened.emulateMedia({ colorScheme: "light" });
	await expect.poll(() => look(reopened)).toEqual(green);

	// Mono is plain black and white again.
	await reopened.getByTitle("Mono").click();
	await expect
		.poll(() => look(reopened))
		.toMatchObject({ page: "rgb(255, 255, 255)", text: "rgb(0, 0, 0)" });
});

// The caret was drawn in the page's default ink, set on <html>, so in a
// dark theme it was dark on a dark field and could not be seen.
test("the text caret is drawn in the accent, in a dark theme too", async ({
	openPopup,
	openPanel,
}) => {
	const page = await createProfile(openPopup);
	await button(page, "Switch to dark theme").click();
	await page.goto(page.url().replace(/#.*$/, "#/settings/appearance"));
	await page.getByTitle("Purple").click();
	const accent = rgbOf(accentColorOf("purple", null)!);
	const caret = () =>
		page.evaluate(
			() => getComputedStyle(document.activeElement!).caretColor,
		);
	// A form field, the note editor and the AI box.
	await page.goto(page.url().replace(/#.*$/, "#/profile"));
	await page.getByLabel("Name").focus();
	await expect.poll(caret).toBe(accent);
	await page.goto(page.url().replace(/#.*$/, "#/note/new"));
	await page.getByRole("button", { name: "Edit" }).click();
	await page.locator("textarea").first().focus();
	await expect.poll(caret).toBe(accent);
	// The AI box is in LittleAI's side panel.
	const panel = await openPanel();
	await panel.getByRole("textbox", { name: "Ask LittleAI" }).focus();
	await expect
		.poll(() =>
			panel.evaluate(
				() => getComputedStyle(document.activeElement!).caretColor,
			),
		)
		.toBe(accent);
});

test("Side panel setting switches between Everything, AI only, and None and opens LittleAI inline when None", async ({
	openPopup,
}) => {
	const provider = await startProvider();
	try {
		const page = await createProfile(openPopup);
		await command(page, "settings.update", {
			ai: {
				provider: "Custom",
				baseUrl: provider.url + "/v1",
				apiKey: "",
				model: "fixture-model",
			},
		});
		await button(page, "Open profile menu").click();
		await button(page, "Settings").click();
		await button(page, "Misc").click();
		await expect(dropdown(page, "Side panel")).toHaveAccessibleName(
			"Side panel: AI only, change",
		);
		await choose(page, "Side panel", "Everything");
		await choose(page, "Side panel", "None");
		await button(page, "Go back").click();
		await button(page, "Go back").click();
		await expect(page).toHaveURL(/#\/home$/);
		await button(page, "Open LittleAI").click();
		await expect(page).toHaveURL(/#\/ai$/);
		await expect(page.getByTestId("ai-assist-input")).toBeVisible();
		await button(page, "Go back").click();
		await expect(page).toHaveURL(/#\/home$/);
	} finally {
		await provider.close();
	}
});
