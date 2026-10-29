import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LTHEME } from "little-shared/enums";
import { ThemeContext } from "../../src/popup/contexts/Theme";
import { LUINoteDetailForm } from "../../src/popup/components/LUINoteDetailForm/Component";

const mocks = vi.hoisted(() => ({
	send: vi.fn(async () => null),
}));

vi.mock("../../src/utils/send", () => ({
	send: mocks.send,
}));

vi.mock("react-router", async () => {
	const actual =
		await vi.importActual<typeof import("react-router")>("react-router");
	return {
		...actual,
		useNavigate: () => () => {},
	};
});

describe("note detail manual save flow", () => {
	let container: HTMLDivElement;
	let root: Root;
	const note = { id: "note-99", content: "Initial note" };

	beforeEach(async () => {
		(
			globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
		).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		mocks.send.mockClear();

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
		const editToggle = Array.from(
			container.querySelectorAll("button"),
		).find((button) => button.textContent?.trim() === "Edit");
		expect(editToggle).toBeTruthy();
		if (!editToggle) {
			return;
		}

		await act(async () => {
			editToggle.dispatchEvent(
				new MouseEvent("click", { bubbles: true }),
			);
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

		expect(mocks.send).not.toHaveBeenCalled();

		const updateButton = Array.from(
			container.querySelectorAll("button"),
		).find((button) => button.textContent?.includes("Update"));
		expect(updateButton).toBeTruthy();
		if (!updateButton) {
			return;
		}
		expect(updateButton.hasAttribute("disabled")).toBe(false);

		await act(async () => {
			updateButton.dispatchEvent(
				new MouseEvent("click", { bubbles: true }),
			);
		});

		expect(mocks.send).toHaveBeenCalledTimes(1);
		expect(mocks.send).toHaveBeenCalledWith("note.update", {
			id: note.id,
			content: "Updated draft",
		});
	});
});
