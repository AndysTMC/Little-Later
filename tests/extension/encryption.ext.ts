import { createProfile, expect, test } from "./fixtures";
import {
	button,
	command,
	openNote,
	rows,
	seedReminder,
	seedSave,
	seedTask,
} from "./support";

test("a protected profile stores encrypted per-record bodies for saves, notes, tasks, and reminders", async ({
	openPopup,
}) => {
	const page = await createProfile(
		openPopup,
		"Encrypted sample",
		"sample protection password",
	);
	const strings = {
		saves: "Unique save title Cedar",
		notes: "Unique note content Maple",
		tasks: "Unique task description Hazel",
		reminders: "Unique reminder message Fir",
	};
	await seedSave(page, strings.saves);
	await command(page, "note.create", { content: strings.notes });
	await seedTask(page, strings.tasks);
	await seedReminder(page, strings.reminders);
	const [profile] = await rows(page, "profiles");
	expect(profile).toMatchObject({ protection: "password" });
	expect(profile.keys).toEqual([
		expect.objectContaining({ wrapped: expect.anything() }),
	]);
	expect(profile.keys).not.toEqual([
		expect.objectContaining({ raw: expect.anything() }),
	]);
	for (const [table, plaintext] of Object.entries(strings)) {
		const [row, ...other] = await rows<{ id: string; body: number[] }>(
			page,
			table,
		);
		expect(other).toHaveLength(0);
		expect(row).toMatchObject({
			profileId: profile.id,
			keyId: expect.any(Number),
		});
		expect(Buffer.from(row.body).length).toBeGreaterThan(
			Buffer.byteLength(plaintext),
		);
		const metadata = { ...row, body: undefined };
		expect(JSON.stringify(metadata)).not.toContain(plaintext);
		expect(Buffer.from(row.body).includes(Buffer.from(plaintext))).toBe(
			false,
		);
		if (table === "saves") {
			expect(JSON.stringify(metadata)).not.toContain("http://127.0.0.1/");
		}
	}
	// The ciphertext belongs to the records the user can actually open.
	await openNote(page, strings.notes);
	await expect(page.getByText(strings.notes, { exact: true })).toBeVisible();
	await expect(button(page, "Edit")).toBeVisible();
});

// A command bound to an unlock (an AI tool's write, decision 0015/0017's
// owner) must be refused once that unlock is over. The worker's listener
// once dropped the binding, so such a write landed anyway.
test("a write bound to an ended unlock is refused by the worker", async ({
	openPopup,
}) => {
	const page = await createProfile(openPopup);
	const result = await page.evaluate(() =>
		chrome.runtime.sendMessage({
			type: "little/command",
			name: "note.create",
			input: { content: "From a request that outlived its unlock" },
			unlockId: "an-unlock-that-ended",
		}),
	);
	expect(result).toMatchObject({
		ok: false,
		error: { message: /profile changed/i },
	});
	expect(await rows(page, "notes")).toHaveLength(0);
});
