import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LINT_BOOLEAN, LTHEME } from "little-shared/enums";
import { ThemeContext } from "../../src/popup/contexts/Theme";
import { LUIAuthGate } from "../../src/popup/components/LUIAuthGate/Component";

const mocks = vi.hoisted(() => ({
	checkLockPassword: vi.fn(),
	authenticateUser: vi.fn(),
	deleteUser: vi.fn(),
}));

vi.mock("../../src/services/user", () => mocks);
vi.mock("../../src/popup/hooks/useUserAvatar", () => ({
	useUserAvatar: () => undefined,
}));
vi.mock("little-shared/utils/misc", async (importOriginal) => ({
	...(await importOriginal<typeof import("little-shared/utils/misc")>()),
	fakeWait: async () => {},
}));

const typeInto = async (input: HTMLInputElement, value: string) => {
	const setValue = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	await act(async () => {
		setValue?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
};

const button = (container: HTMLElement, label: string) =>
	Array.from(container.querySelectorAll("button")).find(
		(candidate) => candidate.textContent?.trim() === label,
	) as HTMLButtonElement;

const click = async (element: HTMLElement) => {
	await act(async () => {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
};

describe("lock screen", () => {
	let container: HTMLDivElement;
	let root: Root;
	const handleFunction = vi.fn(async () => {});

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
						<LUIAuthGate
							type="Lock"
							userProfile={{
								userId: 7,
								name: "Ada",
								theme: LTHEME.LIGHT,
								isCurrent: LINT_BOOLEAN.TRUE,
							}}
							handleFunction={handleFunction}
						/>
					</ThemeContext.Provider>
				</MemoryRouter>,
			);
		});
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
	});

	const passwordInput = () =>
		container.querySelector<HTMLInputElement>("#little-auth-password")!;
	const confirmInput = () =>
		container.querySelector<HTMLInputElement>(
			"#little-auth-password-confirm",
		);

	it("locks straight away with the current password", async () => {
		mocks.checkLockPassword.mockResolvedValue({ kind: "current" });
		await typeInto(passwordInput(), "secret");
		await click(button(container, "Go"));
		expect(handleFunction).toHaveBeenCalledWith("secret");
	});

	it("asks for a new password twice and refuses a mismatch", async () => {
		mocks.checkLockPassword.mockResolvedValue({ kind: "new" });
		await typeInto(passwordInput(), "secrte");
		await click(button(container, "Go"));
		expect(handleFunction).not.toHaveBeenCalled();
		expect(confirmInput()).not.toBeNull();

		await typeInto(confirmInput()!, "secret");
		await click(button(container, "Go"));
		expect(handleFunction).not.toHaveBeenCalled();
		expect(container.textContent).toContain("don't match");

		await typeInto(confirmInput()!, "secrte");
		await click(button(container, "Go"));
		expect(handleFunction).toHaveBeenCalledWith("secrte");
	});

	it("needs an explicit second press to remove the password", async () => {
		mocks.checkLockPassword.mockResolvedValue({ kind: "remove" });
		await click(button(container, "Go"));
		expect(handleFunction).not.toHaveBeenCalled();

		await click(button(container, "Remove password and lock"));
		expect(handleFunction).toHaveBeenCalledWith(undefined);
	});

	it("shows why a password is refused", async () => {
		mocks.checkLockPassword.mockResolvedValue({
			kind: "invalid",
			problem: "A password can't start or end with a space.",
		});
		await typeInto(passwordInput(), " secret");
		await click(button(container, "Go"));
		expect(handleFunction).not.toHaveBeenCalled();
		expect(container.textContent).toContain("start or end with a space");
	});

	it("asks for the current password in its own field when deleting", async () => {
		mocks.deleteUser.mockRejectedValueOnce(
			new Error("Enter this profile's password to delete it."),
		);
		await typeInto(passwordInput(), "a-new-password");
		await click(button(container, "Delete"));
		const deleteField = container.querySelector<HTMLInputElement>(
			"#little-auth-delete-password",
		);
		expect(deleteField).not.toBeNull();

		await click(button(container, "Confirm delete"));
		expect(mocks.deleteUser).toHaveBeenLastCalledWith(7, undefined);
		expect(container.textContent).toContain("password to delete it");

		await typeInto(deleteField!, "current-secret");
		await click(button(container, "Confirm delete"));
		expect(mocks.deleteUser).toHaveBeenLastCalledWith(7, "current-secret");
	});
});
