import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LTHEME } from "little-shared/enums";
import { SparkleIcon } from "@phosphor-icons/react";
import { ThemeContext } from "../../src/popup/contexts/ThemeContext";
import {
	LUITooltip,
	TOOLTIP_CLOSE_DELAY_MS,
	TOOLTIP_OPEN_DELAY_MS,
} from "../../src/popup/components/LUITooltip/Component";
import { LUIBadge } from "../../src/popup/components/LUIBadge/Component";
import { LUISectionHeader } from "../../src/popup/components/LUISectionHeader/Component";

const themeValue = {
	theme: LTHEME.LIGHT,
	preference: "light" as const,
	toggleTheme: () => {},
	setTheme: () => {},
	setPreference: () => {},
	accent: "mono" as const,
	setAccent: () => {},
	accentColor: "#0e7490",
	setAccentColor: () => {},
	showLookOf: () => {},
};

describe("Design system primitives", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		(
			globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
		).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		vi.useRealTimers();
		act(() => root.unmount());
		container.remove();
	});

	it("LUITooltip respects hover intent delay, cancels on quick leave, and links aria-describedby", () => {
		vi.useFakeTimers();
		act(() => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<LUITooltip content="Open Little AI" shortcut="A">
						<button type="button" aria-label="Open Little AI">
							AI
						</button>
					</LUITooltip>
				</ThemeContext.Provider>,
			);
		});

		const button = container.querySelector("button")!;
		expect(document.querySelector('[role="tooltip"]')).toBeNull();

		// Quick hover-in and hover-out before delay should never show the tooltip.
		act(() => {
			button.dispatchEvent(
				new MouseEvent("mouseover", { bubbles: true }),
			);
			vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS - 50);
			button.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
			vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS + 100);
		});
		expect(document.querySelector('[role="tooltip"]')).toBeNull();

		// Sustained hover past delay opens the portal tooltip with aria-describedby.
		act(() => {
			button.dispatchEvent(
				new MouseEvent("mouseover", { bubbles: true }),
			);
			vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS);
		});
		const tip = document.querySelector('[role="tooltip"]');
		expect(tip).toBeTruthy();
		expect(tip?.textContent).toContain("Open Little AI");
		expect(tip?.textContent).toContain("A");
		expect(button.getAttribute("aria-describedby")).toBe(tip?.id);

		// Pointer leave closes after the close grace delay.
		act(() => {
			button.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
			vi.advanceTimersByTime(TOOLTIP_CLOSE_DELAY_MS);
		});
		expect(document.querySelector('[role="tooltip"]')).toBeNull();
		expect(button.getAttribute("aria-describedby")).toBeNull();
	});

	it("LUITooltip opens immediately on focus, dismisses on Escape and click, and honors disabled", () => {
		const onClick = vi.fn();
		act(() => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<LUITooltip content="Edit task">
						<button type="button" onClick={onClick}>
							Edit
						</button>
					</LUITooltip>
				</ThemeContext.Provider>,
			);
		});

		const button = container.querySelector("button")!;
		act(() => {
			button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		});
		expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
			"Edit task",
		);

		// Escape dismisses immediately.
		act(() => {
			window.dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape" }),
			);
		});
		expect(document.querySelector('[role="tooltip"]')).toBeNull();

		// Re-open on focus, then click dismisses and still runs child onClick.
		act(() => {
			button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		});
		expect(document.querySelector('[role="tooltip"]')).toBeTruthy();
		act(() => {
			button.click();
		});
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(document.querySelector('[role="tooltip"]')).toBeNull();

		// Disabled suppresses tooltip completely.
		act(() => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<LUITooltip content="Hidden label" disabled>
						<button type="button">Visible</button>
					</LUITooltip>
				</ThemeContext.Provider>,
			);
		});
		act(() => {
			container
				.querySelector("button")!
				.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		});
		expect(document.querySelector('[role="tooltip"]')).toBeNull();
	});

	it("LUITooltip supports tooltips on disabled buttons", () => {
		vi.useFakeTimers();
		act(() => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<LUITooltip content="Managed by task">
						<button type="button" disabled>
							Edit
						</button>
					</LUITooltip>
				</ThemeContext.Provider>,
			);
		});

		const wrapper = container.querySelector("span")!;
		act(() => {
			wrapper.dispatchEvent(
				new MouseEvent("mouseover", { bubbles: true }),
			);
			vi.advanceTimersByTime(TOOLTIP_OPEN_DELAY_MS);
		});
		expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
			"Managed by task",
		);
	});

	it("LUIBadge and LUISectionHeader render tones, icons, and action slots cleanly", () => {
		act(() => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<LUISectionHeader
						title="Connected servers"
						description="Runs locally over loopback."
						action={
							<LUIBadge
								tone="accent"
								size="sm"
								icon={SparkleIcon}
							>
								2 active
							</LUIBadge>
						}
					/>
					<LUIBadge tone="danger">Error</LUIBadge>
					<LUIBadge tone="muted">Paused</LUIBadge>
				</ThemeContext.Provider>,
			);
		});

		expect(container.querySelector("h2")?.textContent).toBe(
			"Connected servers",
		);
		expect(container.textContent).toContain("Runs locally over loopback.");
		expect(container.textContent).toContain("2 active");
		expect(container.textContent).toContain("Error");
		expect(container.textContent).toContain("Paused");
		expect(container.querySelector("svg")).toBeTruthy();
	});
});
