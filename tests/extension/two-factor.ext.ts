import type { Page } from "@playwright/test";
import { createProfile, expect, sendCommand, test } from "./fixtures";
import { button, lock, rows } from "./support";

// Two-factor unlock (decision 0015) in the built extension, with Chrome's
// virtual authenticator standing in for a security key with PRF. The page
// is a tab, so the key prompt runs in place, as it does in the window the
// toolbar popup opens for it.

const PASSWORD = "first sample password";

const addSecurityKey = async (page: Page) => {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("WebAuthn.enable");
	await cdp.send("WebAuthn.addVirtualAuthenticator", {
		options: {
			protocol: "ctap2",
			ctap2Version: "ctap2_1",
			transport: "usb",
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			hasPrf: true,
			automaticPresenceSimulation: true,
		},
	});
};

const goHome = (page: Page) => page.goto(page.url().replace(/#.*$/, "#/home"));

const openTwoFactor = async (page: Page) => {
	await button(page, "Open profile menu").click();
	await button(page, "Settings").click();
	await button(page, "Security").click();
	await button(page, "Two-factor unlock").click();
	await expect(page).toHaveURL(/#\/settings\/security\/two-factor$/);
};

test("a security key and the password unlock together; the recovery code works without the key", async ({
	openPopup,
}) => {
	test.setTimeout(90_000);
	const page = await createProfile(openPopup, "Ada", PASSWORD);
	await addSecurityKey(page);

	await openTwoFactor(page);
	await button(page, "Add a key").click();
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await button(page, "Add key").click();
	const code = page.locator("code");
	await expect(code).toHaveText(/^([A-Z2-9]{5}-){4}[A-Z2-9]{5}$/);
	const recoveryCode = (await code.textContent())!;
	await button(page, "Done").click();
	// Named for what it is, with the day it was added.
	await expect(
		page.getByRole("button", { name: /^Security key · added / }),
	).toBeVisible();
	// No root key is wrapped by the password alone any more.
	await expect
		.poll(async () => (await rows(page, "profiles"))[0])
		.toMatchObject({ keys: [] });

	// The password alone is refused.
	const [profile] = await rows<{ id: string }>(page, "profiles");
	await goHome(page);
	await lock(page);
	expect(
		await sendCommand(page, "profile.unlock", {
			profileId: profile.id,
			password: PASSWORD,
		}),
	).toMatchObject({
		ok: false,
		error: { message: /needs its security key or recovery code/ },
	});

	// The password, then the key.
	await button(page, "Open profile Ada").click();
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await button(page, "Unlock").click();
	await expect(page.getByRole("tablist")).toBeVisible();

	// The password and the recovery code, typed loosely.
	await lock(page);
	await button(page, "Open profile Ada").click();
	await button(page, "Use a recovery code instead").click();
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await page
		.getByLabel("Recovery code")
		.fill(recoveryCode.toLowerCase().replace(/-/g, " "));
	await button(page, "Unlock").click();
	await expect(page.getByRole("tablist")).toBeVisible();

	// Turned off, the password alone unlocks again.
	await openTwoFactor(page);
	await button(page, "Turn off two-factor unlock").click();
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await button(page, "Turn off").click();
	await expect(button(page, "Add a key")).toBeVisible();
	await expect
		.poll(async () => (await rows(page, "profiles"))[0].keys)
		.toHaveLength(1);
	await goHome(page);
	await lock(page);
	await button(page, "Open profile Ada").click();
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await button(page, "Unlock").click();
	await expect(page.getByRole("tablist")).toBeVisible();
});
