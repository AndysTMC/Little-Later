import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LTHEME } from "little-shared/enums";
import { ThemeContext } from "../../src/popup/contexts/ThemeContext";
import { LUINoteMini } from "../../src/popup/components/LUINoteMini/Component";
import {
	searchNotes,
	searchReminders,
	searchSaves,
	searchTasks,
} from "../../src/popup/records";
import { currentOwner } from "../../src/services/ai/owner";
import { readNotes } from "../../src/services/ai/records";
import { deleteNoteToolCall } from "../../src/services/ai/toolCalls/deleteNote";
import {
	listNotes,
	listReminders,
	listSaves,
	listTasks,
} from "../../src/storage/repositories";
import { littleDB } from "../../src/storage/pageDB";
import { send } from "../../src/utils/send";
import {
	collectProfileTags,
	normalizeTag,
	normalizeTags,
	recordMatchesTagWord,
} from "../../src/utils/tags";
import { freshProfile } from "../ai/profile";

const themeValue = {
	theme: LTHEME.DARK,
	preference: "dark" as const,
	toggleTheme: () => {},
	setTheme: () => {},
	setPreference: () => {},
	accent: "mono" as const,
	setAccent: () => {},
	accentColor: "#0e7490",
	setAccentColor: () => {},
	showLookOf: () => {},
};

describe("Milestone 1: tags, save archive, and locked notes", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		(
			globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
		).IS_REACT_ACT_ENVIRONMENT = true;
		await freshProfile();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => root.unmount());
		container.remove();
	});

	it("normalizes, deduplicates, and ranks tags cleanly", () => {
		expect(normalizeTag("  #Job Search  ")).toBe("job-search");
		expect(normalizeTag("###")).toBe("");
		expect(
			normalizeTags(["#Thesis", "thesis", "  Trip Plan ", "", "AI"]),
		).toEqual(["thesis", "trip-plan", "ai"]);
		expect(
			collectProfileTags([
				[{ tags: ["work", "ai"] }, { tags: ["work"] }],
				[{ tags: ["personal", "work"] }],
			]),
		).toEqual(["work", "ai", "personal"]);
		expect(recordMatchesTagWord(["job-search"], "#job")).toBe(true);
		expect(recordMatchesTagWord(["job-search"], "finance")).toBe(false);
	});

	it("persists tags across saves, tasks, reminders, and notes and matches #tag search", async () => {
		const keys = await (await currentOwner()).keys();
		const { id: saveId } = await send("save.capture", {
			url: "https://example.com/paper",
			title: "Research Paper",
			saved: true,
		});
		await send("save.update", {
			id: saveId,
			tags: ["#Thesis", "reading"],
		});
		await send("task.create", {
			information: "Outline chapter one",
			schedule: { kind: "anytime" },
			tags: ["thesis"],
		});
		await send("reminder.create", {
			message: "Email advisor",
			target: Date.now() + 3_600_000,
			tags: ["thesis"],
		});
		await send("note.create", {
			content: "Key citations for introduction",
			tags: ["thesis"],
		});

		const saves = await listSaves(littleDB, keys, true);
		const tasks = await listTasks(littleDB, keys, false);
		const reminders = await listReminders(littleDB, keys);
		const notes = await listNotes(littleDB, keys);

		expect(saves[0].tags).toEqual(["thesis", "reading"]);
		expect(tasks[0].tags).toEqual(["thesis"]);
		expect(reminders[0].tags).toEqual(["thesis"]);
		expect(notes[0].tags).toEqual(["thesis"]);

		expect(searchSaves(saves, "#thesis")).toHaveLength(1);
		expect(searchTasks(tasks, "#thesis")).toHaveLength(1);
		expect(searchReminders(reminders, "#thesis")).toHaveLength(1);
		expect(searchNotes(notes, "#thesis")).toHaveLength(1);
	});

	it("archives and unarchives saves while preserving metadata across revisits", async () => {
		const keys = await (await currentOwner()).keys();
		const { id } = await send("save.capture", {
			url: "https://example.com/archive-me",
			title: "Long Article",
			saved: true,
		});
		await send("save.update", {
			id,
			archived: true,
			tags: ["reading"],
		});

		// Revisiting the URL must preserve archived status and tags.
		await send("save.capture", {
			url: "https://example.com/archive-me",
			title: "Long Article — Updated",
		});

		let saves = await listSaves(littleDB, keys, true);
		expect(saves[0].archived).toBe(true);
		expect(saves[0].tags).toEqual(["reading"]);

		await send("save.update", { id, archived: false });
		saves = await listSaves(littleDB, keys, true);
		expect(Boolean(saves[0].archived)).toBe(false);
		expect(saves[0].tags).toEqual(["reading"]);
	});

	it("enforces password protection on locked notes and hides them from search, UI preview, and LittleAI", async () => {
		// Passwordless profile cannot create a locked note.
		await expect(
			send("note.create", {
				content: "Top secret recovery keys",
				locked: true,
				title: "Vault secrets",
			}),
		).rejects.toThrow(/password/i);

		// Set a profile password, then create a locked note and a normal note.
		const initialKeys = await (await currentOwner()).keys();
		await send("profile.changePassword", {
			profileId: initialKeys.profileId,
			oldPassword: null,
			newPassword: "strong-password",
		});

		const { id: lockedId } = await send("note.create", {
			content: "Top secret passphrase: coral-falcon-99",
			locked: true,
			title: "Bank vault",
			tags: ["finance"],
		});
		await send("note.create", {
			content: "Public grocery list: apples",
			tags: ["errands"],
		});

		const owner = await currentOwner();
		const keys = await owner.keys();
		const allNotes = await listNotes(littleDB, keys);
		expect(allNotes).toHaveLength(2);

		// Plain search must never match locked body text, only visible title & tags.
		expect(searchNotes(allNotes, "coral-falcon-99")).toHaveLength(0);
		expect(searchNotes(allNotes, "Bank vault")).toHaveLength(1);
		expect(searchNotes(allNotes, "#finance")).toHaveLength(1);

		// LittleAI readNotes must completely exclude locked notes.
		const aiVisibleNotes = await readNotes(keys);
		expect(aiVisibleNotes).toHaveLength(1);
		expect(aiVisibleNotes[0].content).toContain("grocery list");

		// LittleAI delete tool must refuse to delete a locked note by ID.
		await expect(
			deleteNoteToolCall(owner, { id: lockedId }),
		).rejects.toThrow("Note not found.");

		// LUINoteMini must hide locked note body and show lock indicator + visible title.
		const lockedNote = allNotes.find((n) => n.id === lockedId)!;
		act(() => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<LUINoteMini note={lockedNote} onOpen={() => {}} />
				</ThemeContext.Provider>,
			);
		});
		expect(container.textContent).toContain("Bank vault");
		expect(container.textContent).toContain(
			"Locked · Enter password to view",
		);
		expect(container.textContent).toContain("#finance");
		expect(container.textContent).not.toContain("coral-falcon-99");
	});
});
