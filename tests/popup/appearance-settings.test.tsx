import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LUIAppearanceSettings } from "../../src/popup/pages/LUIAppearanceSettings/Page";

const theme = vi.hoisted(() => ({
	accent: "blue",
	setAccent: vi.fn(),
	setAccentColor: vi.fn(),
}));
vi.mock("../../src/popup/hooks/useTheme", () => ({
	useTheme: () => ({
		theme: "little-light",
		preference: "system",
		setPreference: () => {},
		accent: theme.accent,
		setAccent: theme.setAccent,
		accentColor: "#0e7490",
		setAccentColor: theme.setAccentColor,
	}),
}));

const render = async () => {
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () =>
		root.render(
			<MemoryRouter>
				<LUIAppearanceSettings />
			</MemoryRouter>,
		),
	);
};

let root: Root;
let container: HTMLDivElement;

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	theme.accent = "blue";
	theme.setAccent.mockClear();
	theme.setAccentColor.mockClear();
});

// One group of native radios: a single Tab stop, and arrow keys move the
// choice, as a radio group should.
describe("the accent choice", () => {
	it("is one radio group with the current accent checked", async () => {
		await render();
		const radios = Array.from(
			container.querySelectorAll<HTMLInputElement>(
				"input[type='radio'][name='accent']",
			),
		);
		// The standard set, and Custom.
		expect(radios.map((radio) => radio.value)).toEqual([
			"mono",
			"red",
			"orange",
			"amber",
			"green",
			"teal",
			"blue",
			"indigo",
			"purple",
			"pink",
			"custom",
		]);
		expect(
			radios.filter((radio) => radio.checked).map((r) => r.value),
		).toEqual(["blue"]);
		expect(container.querySelector("legend")?.textContent).toBe("Accent");
		// Its dials show only for Custom.
		expect(container.querySelector("input[type='range']")).toBeNull();
		await act(async () => radios.find((r) => r.value === "green")!.click());
		expect(theme.setAccent).toHaveBeenCalledWith("green");
	});
});

describe("the Custom accent", () => {
	it("is set with two dials or a typed colour", async () => {
		theme.accent = "custom";
		await render();
		const [hue, strength] = Array.from(
			container.querySelectorAll<HTMLInputElement>("input[type='range']"),
		);
		expect(hue.labels?.[0]?.textContent).toBe("Hue");
		expect(strength.labels?.[0]?.textContent).toBe("Strength");

		const setValue = (input: HTMLInputElement, value: string) => {
			const set = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)!.set!;
			set.call(input, value);
			input.dispatchEvent(new Event("input", { bubbles: true }));
		};
		await act(async () => setValue(hue, "300"));
		const dialled = theme.setAccentColor.mock.calls.at(-1)?.[0];
		expect(dialled).toMatch(/^#[0-9a-f]{6}$/);
		expect(dialled).not.toBe("#0e7490");

		const typed =
			container.querySelector<HTMLInputElement>("input[type='text']")!;
		theme.setAccentColor.mockClear();
		await act(async () => setValue(typed, "#12"));
		expect(theme.setAccentColor).not.toHaveBeenCalled();
		expect(typed.getAttribute("aria-invalid")).toBe("true");
		await act(async () => setValue(typed, "#7C3AED"));
		expect(theme.setAccentColor).toHaveBeenCalledWith("#7c3aed");
		theme.accent = "blue";
	});
});
