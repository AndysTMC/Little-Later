import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LTHEME } from "little-shared/enums";
import { ThemeContext } from "../../src/popup/contexts/ThemeContext";
import { Answer } from "../../src/panel/Answer";
import { QuestionBox } from "../../src/panel/AskBox";

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

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
});

describe("side panel Answer component", () => {
	it("does not extract markdown images inside fenced or inline code blocks", () => {
		const dataImg =
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
		act(() => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<Answer
						chatId="chat-1"
						output={{
							message: `Example:\n\`\`\`md\n![code-img](${dataImg})\n\`\`\`\nInline \`![inline-img](${dataImg})\``,
							expression: "neutral",
							steps: ["Searched notes"],
						}}
						isLatest={false}
						idle={true}
						docked={false}
						onRegenerate={null}
					/>
				</ThemeContext.Provider>,
			);
		});
		// No ImageAttachment card should be rendered for images inside code.
		expect(container.querySelector("img")).toBeNull();
		// Single step should not render an expandable <button>.
		const buttons = Array.from(container.querySelectorAll("button")).map(
			(b) => b.textContent?.trim(),
		);
		expect(buttons).not.toContain("Searched notes");
		expect(container.textContent).toContain("Searched notes");
	});
});

describe("side panel AskBox keyboard gating", () => {
	it("ignores number-key shortcuts while inactive (e.g., history drawer open)", () => {
		const onAnswer = vi.fn();
		const onSomethingElse = vi.fn();
		const onDismiss = vi.fn();
		act(() => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<QuestionBox
						question={{
							question: "Pick one",
							options: ["Alpha", "Beta"],
							allowOther: false,
						}}
						active={false}
						onAnswer={onAnswer}
						onSomethingElse={onSomethingElse}
						onDismiss={onDismiss}
					/>
				</ThemeContext.Provider>,
			);
		});
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
		});
		expect(onAnswer).not.toHaveBeenCalled();

		// When active, pressing "1" selects the first option.
		act(() => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<QuestionBox
						question={{
							question: "Pick one",
							options: ["Alpha", "Beta"],
							allowOther: false,
						}}
						active={true}
						onAnswer={onAnswer}
						onSomethingElse={onSomethingElse}
						onDismiss={onDismiss}
					/>
				</ThemeContext.Provider>,
			);
		});
		act(() => {
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
		});
		expect(onAnswer).toHaveBeenCalledWith("Alpha");
	});
});
