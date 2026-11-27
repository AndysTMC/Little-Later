import { createProfile, expect, test } from "./fixtures";
import { button, command, seedSave, tab } from "./support";

const TINY_PNG_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgAAIAAAUAAQ0KLbQAAAAASUVORK5CYII=";

test("locked notes require password to open, reject wrong password, hide body in list & search, and re-lock on leave", async ({
	openPopup,
}) => {
	const password = "VaultPassword#2026";
	const page = await createProfile(openPopup, "Ada", password);

	// Create a locked note via the bottom-bar New note button.
	await button(page, "New note").click();
	await page.getByLabel("Note content").fill("SECRET-RECOVERY-CODE-9941");
	await page.getByRole("switch", { name: "Lock with password" }).click();
	await page
		.getByLabel("Visible title for locked note")
		.fill("Bank backup codes");
	await button(page, "Create").click();

	// In Notes list: title is shown, secret body is NOT shown.
	await tab(page, "Notes").click();
	await expect(page.getByText("Bank backup codes")).toBeVisible();
	await expect(
		page.getByText("Locked · Enter password to view"),
	).toBeVisible();
	await expect(page.getByText("SECRET-RECOVERY-CODE-9941")).toHaveCount(0);

	// Home search must NOT match the hidden body of a locked note.
	const search = page.getByPlaceholder("Search");
	await search.click();
	await search.fill("SECRET-RECOVERY-CODE-9941");
	await expect(page.getByText("No results found")).toBeVisible();
	await search.fill("");
	await page.keyboard.press("Escape");

	// Opening the locked note shows the password gate.
	await button(page, /Open locked note: Bank backup codes/).click();
	await expect(
		page.getByText(/Enter your profile password to view this note/),
	).toBeVisible();
	await expect(page.getByText("SECRET-RECOVERY-CODE-9941")).toHaveCount(0);

	// Wrong password is rejected.
	const gateInput = page.getByPlaceholder("Profile password");
	await gateInput.fill("WrongPassword");
	await button(page, "Unlock note").click();
	await expect(page.getByText(/password/i)).toBeVisible();
	await expect(page.getByText("SECRET-RECOVERY-CODE-9941")).toHaveCount(0);

	// Correct password unlocks the note content.
	await gateInput.fill(password);
	await button(page, "Unlock note").click();
	await expect(page.getByText("SECRET-RECOVERY-CODE-9941")).toBeVisible();

	// Navigating back and re-opening re-locks the note immediately.
	await button(page, "Go back").click();
	await button(page, /Open locked note: Bank backup codes/).click();
	await expect(
		page.getByText(/Enter your profile password to view this note/),
	).toBeVisible();
	await expect(page.getByText("SECRET-RECOVERY-CODE-9941")).toHaveCount(0);
});

test("saves Active/Archived filter, cross-record tags, and Images tab work end-to-end", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);

	const { id: saveId } = await seedSave(page, "Design System");
	await command(page, "save.update", {
		id: saveId,
		tags: ["design"],
	});
	await command(page, "image.create", {
		bytesBase64: TINY_PNG_BASE64,
		mimeType: "image/png",
		title: "Brand mark",
		tags: ["design"],
	});

	// Saves tab shows active save and clickable tag chip that searches across records.
	await tab(page, "Saves").click();
	await expect(page.getByText("Design System")).toBeVisible();
	await expect(button(page, "Filter by tag design")).toBeVisible();
	await button(page, "Filter by tag design").click();
	await expect(page.getByText("Design System")).toBeVisible();
	await expect(page.getByText("Brand mark")).toBeVisible();
	await button(page, "Clear search").click();
	await expect(tab(page, "Saves")).toBeVisible();

	// Archive the save -> disappears from Active, appears under Archived.
	await button(page, /Design System/).click();
	await button(page, "Archive save").click();
	await expect(page.getByText("Design System")).toHaveCount(0);
	await button(page, /^Archived/).click();
	await expect(page.getByText("Design System")).toBeVisible();

	// Images tab renders the saved image, opens detail page, and Add image goes to /pick-file.
	await tab(page, "Images").click();
	await expect(page.getByText("Brand mark")).toBeVisible();
	await button(page, "Add image").click();
	await expect(page).toHaveURL(/#\/pick-file\?/);
	await expect(
		page.getByRole("heading", { name: "Add images" }),
	).toBeVisible();
	await button(page, "Go back").click();
	await tab(page, "Images").click();
	await button(page, /Open image: Brand mark/).click();
	await expect(page.getByLabel("Title")).toHaveValue("Brand mark");
	await expect(button(page, "Download")).toBeVisible();
	await button(page, "Go back").click();

	// Data & Privacy and AI Settings (Local / Cloud / Custom) are clean and navigable.
	await button(page, "Open profile menu").click();
	await button(page, "Settings").click();
	await button(page, "Data & Privacy").click();
	await expect(
		page.getByRole("heading", { name: "Data & Privacy" }),
	).toBeVisible();
	await expect(page.getByText("Clear AI chats")).toBeVisible();
	await expect(page.getByText("External agent MCP")).toBeVisible();
	await button(page, "Go back").click();
	await button(page, "AI").click();
	await expect(button(page, /Provider & Model/)).toBeVisible();
	await expect(button(page, /Behavior & Instructions/)).toBeVisible();
	await expect(button(page, /Memories/)).toBeVisible();
	await expect(button(page, /MCP Tool Servers/)).toBeVisible();
	await button(page, /Provider & Model/).click();
	await tab(page, "Cloud").click();
	await expect(button(page, "OpenAI")).toBeVisible();
	await expect(button(page, "Google Gemini")).toBeVisible();
	await expect(button(page, "Anthropic Claude")).toBeVisible();
	await expect(page.getByPlaceholder("Base URL")).toHaveCount(0);
	await expect(
		page.getByPlaceholder("API Key", { exact: true }),
	).toBeVisible();
	await tab(page, "Local").click();
	await expect(button(page, "Ollama")).toBeVisible();
	await expect(button(page, "LM Studio")).toBeVisible();
	await expect(page.getByText(/Built-in URL/)).toHaveCount(0);
});
