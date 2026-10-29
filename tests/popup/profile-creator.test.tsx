import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LTHEME } from "little-shared/enums";
import { ThemeContext } from "../../src/popup/contexts/Theme";
import { LUIProfileCreator as Page } from "../../src/popup/pages/LUIProfileCreator/Page";

const mocks = vi.hoisted(() => ({
	send: vi.fn(async () => ({ id: "p1" })),
	toast: vi.fn(async () => {}),
}));

vi.mock("../../src/utils/send", () => ({ send: mocks.send }));
vi.mock("../../src/services/toasts", () => ({ createToast: mocks.toast }));
vi.mock("../../src/services/settings", () => ({
	isFirstTimeUser: async () => false,
}));
vi.mock("little-shared/utils/misc", async (importOriginal) => ({
	...(await importOriginal<typeof import("little-shared/utils/misc")>()),
	fakeWait: async () => {},
}));

const typeInto = async (
	container: HTMLElement,
	label: string,
	value: string,
) => {
	const input = container.querySelector(
		`input[aria-label="${label}"]`,
	) as HTMLInputElement;
	const setValue = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	await act(async () => {
		setValue?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
};

const press = async (container: HTMLElement, label: string) => {
	const target = Array.from(container.querySelectorAll("button")).find(
		(candidate) => candidate.textContent?.trim() === label,
	);
	if (!target) throw new Error(`No button ${label}`);
	await act(async () => {
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	vi.clearAllMocks();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () => {
		root.render(
			<MemoryRouter>
				<ThemeContext.Provider
					value={{
						theme: LTHEME.LIGHT,
						toggleTheme: () => {},
						setTheme: () => {},
					}}
				>
					<Page />
				</ThemeContext.Provider>
			</MemoryRouter>,
		);
	});
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

describe("creating a profile", () => {
	// The confirmation field hides once the password is cleared, so a
	// value left in it must not block a profile without a password.
	it("creates it without a password after a typed one is cleared", async () => {
		await typeInto(container, "Profile name", "Ada");
		await typeInto(container, "Password", "secret-pass");
		await typeInto(container, "Confirm password", "secret-pass");
		await typeInto(container, "Password", "");
		await press(container, "Create");
		expect(container.textContent).not.toContain("don't match");
		expect(mocks.send).toHaveBeenCalledWith("profile.create", {
			name: "Ada",
			password: null,
		});
	});

	it("still asks for a matching confirmation when a password is set", async () => {
		await typeInto(container, "Profile name", "Ada");
		await typeInto(container, "Password", "secret-pass");
		await typeInto(container, "Confirm password", "secret-pasz");
		await press(container, "Create");
		expect(container.textContent).toContain("The passwords don't match.");
		expect(mocks.send).not.toHaveBeenCalled();
	});
});
