import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LTHEME } from "little-shared/enums";
import { ThemeContext } from "../../src/popup/contexts/Theme";
import { LUIAuthGate } from "../../src/popup/components/LUIAuthGate/Component";
import { LUIPasswordForm } from "../../src/popup/components/LUIPasswordForm/Component";
import type { UserProfile } from "../../src/popup/hooks/useUserProfiles";

const mocks = vi.hoisted(() => ({ send: vi.fn(async () => null) }));

vi.mock("../../src/utils/send", () => mocks);
vi.mock("../../src/popup/hooks/useUserAvatar", () => ({
	useUserAvatar: () => undefined,
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

const profile = (hasPassword: boolean): UserProfile => ({
	id: "p1",
	name: "Ada",
	hasPassword,
	theme: "light",
	autoLockMinutes: 30,
});

let container: HTMLDivElement;
let root: Root;

const render = async (element: React.ReactNode) => {
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
					{element}
				</ThemeContext.Provider>
			</MemoryRouter>,
		);
	});
};

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	vi.clearAllMocks();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

describe("auth gate", () => {
	it("unlocks a protected profile with its password", async () => {
		const handle = vi.fn(async () => {});
		await render(
			<LUIAuthGate
				type="Unlock"
				userProfile={profile(true)}
				handleFunction={handle}
			/>,
		);
		await press(container, "Unlock");
		expect(handle).not.toHaveBeenCalled();
		expect(container.textContent).toContain(
			"Enter this profile's password",
		);
		await typeInto(container, "Password", "secret");
		await press(container, "Unlock");
		expect(handle).toHaveBeenCalledWith("secret");
	});

	it("shows why an unlock failed", async () => {
		const handle = vi.fn(async () => {
			throw new Error("Wrong password or damaged key.");
		});
		await render(
			<LUIAuthGate
				type="Unlock"
				userProfile={profile(true)}
				handleFunction={handle}
			/>,
		);
		await typeInto(container, "Password", "nope");
		await press(container, "Unlock");
		expect(container.textContent).toContain(
			"Wrong password or damaged key.",
		);
	});

	it("asks no password of a profile without one, and locks without one", async () => {
		const handle = vi.fn(async () => {});
		await render(
			<LUIAuthGate
				type="Lock"
				userProfile={profile(false)}
				handleFunction={handle}
			/>,
		);
		expect(
			container.querySelector('input[aria-label="Password"]'),
		).toBeNull();
		expect(container.textContent).toContain("not encrypted at rest");
		await press(container, "Lock");
		expect(handle).toHaveBeenCalledWith(undefined);
	});

	it("deletes a protected profile only with its password, after confirming", async () => {
		await render(
			<LUIAuthGate
				type="Unlock"
				userProfile={profile(true)}
				handleFunction={async () => {}}
			/>,
		);
		await press(container, "Delete");
		expect(mocks.send).not.toHaveBeenCalled();
		await typeInto(
			container,
			"Current password to delete this profile",
			"secret",
		);
		await press(container, "Confirm delete");
		expect(mocks.send).toHaveBeenCalledWith("profile.delete", {
			profileId: "p1",
			password: "secret",
		});
	});
});

describe("password form", () => {
	it("sets a password typed twice", async () => {
		const submit = vi.fn(async () => {});
		await render(<LUIPasswordForm hasPassword={false} onSubmit={submit} />);
		await typeInto(container, "New password", "abc");
		await typeInto(container, "Confirm new password", "abd");
		await press(container, "Set password");
		expect(container.textContent).toContain("don't match");
		await typeInto(container, "Confirm new password", "abc");
		await press(container, "Set password");
		expect(submit).toHaveBeenCalledWith(null, "abc");
	});

	it("refuses outer spaces", async () => {
		const submit = vi.fn(async () => {});
		await render(<LUIPasswordForm hasPassword={false} onSubmit={submit} />);
		await typeInto(container, "New password", " abc");
		await typeInto(container, "Confirm new password", " abc");
		await press(container, "Set password");
		expect(submit).not.toHaveBeenCalled();
		expect(container.textContent).toContain("start or end with a space");
	});

	it("removes a password only after a second press", async () => {
		const submit = vi.fn(async () => {});
		await render(<LUIPasswordForm hasPassword={true} onSubmit={submit} />);
		await typeInto(container, "Current password", "old");
		await press(container, "Remove password…");
		expect(submit).not.toHaveBeenCalled();
		expect(container.textContent).toContain("not encrypted at rest");
		await press(container, "Remove password");
		expect(submit).toHaveBeenCalledWith("old", null);
	});
});
