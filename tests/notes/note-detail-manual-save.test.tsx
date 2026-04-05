import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LTHEME } from "little-shared/enums";
import { ThemeContext } from "../../src/popup/contexts/Theme";
import { LUINoteDetailForm } from "../../src/popup/components/LUINoteDetailForm/Component";
import { LNote } from "little-shared/types";

const mocks = vi.hoisted(() => ({
	updateNote: vi.fn(async () => {}),
	deleteNote: vi.fn(async () => {}),
}));

vi.mock("../../src/services/note", () => ({
	updateNote: mocks.updateNote,
	deleteNote: mocks.deleteNote,
}));

vi.mock("react-router", async () => {
	const actual =
		await vi.importActual<typeof import("react-router")>("react-router");
	return {
		...actual,
	};
});

describe("note detail manual save flow", () => {
	let container: HTMLDivElement;
	let root: Root;
	const note: LNote = {
		id: 99,
		content: "Initial note",
		lastModificationDate: "2026-04-05T16:10:00+05:30",
	};

	beforeEach(async () => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.updateNote.mockClear();
		mocks.deleteNote.mockClear();

		await act(async () => {
			root.render(
				<ThemeContext.Provider
					value={{
						theme: LTHEME.DARK,
						toggleTheme: () => {},
						setTheme: () => {},
					}}
				>
					<LUINoteDetailForm note={note} />
				</ThemeContext.Provider>,
			);
		});
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		container.remove();
	});

	it("keeps draft local until Update is clicked", async () => {
		const editToggle = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.trim() === "Edit",
		);
		expect(editToggle).toBeTruthy();
		if (!editToggle) {
			return;
		}

		await act(async () => {
			editToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		const textarea = container.querySelector("textarea");
		expect(textarea).toBeTruthy();
		if (!textarea) {
			return;
		}

		await act(async () => {
			const valueSetter = Object.getOwnPropertyDescriptor(
				window.HTMLTextAreaElement.prototype,
				"value",
			)?.set;
			valueSetter?.call(textarea, "Updated draft");
			textarea.dispatchEvent(new Event("input", { bubbles: true }));
			textarea.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(mocks.updateNote).not.toHaveBeenCalled();

		const updateButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Update"),
		);
		expect(updateButton).toBeTruthy();
		if (!updateButton) {
			return;
		}
		expect(updateButton.hasAttribute("disabled")).toBe(false);

		await act(async () => {
			updateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(mocks.updateNote).toHaveBeenCalledTimes(1);
		expect(mocks.updateNote).toHaveBeenCalledWith(
			note.id,
			expect.objectContaining({
				content: "Updated draft",
				lastModificationDate: expect.any(String),
			}),
		);
	});
});
