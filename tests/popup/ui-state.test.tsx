import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { UIStateProvider } from "../../src/popup/contexts/UIState";
import { useDraft } from "../../src/popup/hooks/useDraft";
import { createWebSessionStore } from "../../src/storage/session";
import {
	ROUTE_MAX_AGE_MS,
	UI_STATE_PREFIX,
	isRememberedRoute,
	readUIState,
	routeToRestore,
} from "../../src/popup/uiState";

// The popup closes whenever it loses focus. What was typed and the page
// that was open are remembered, so reopening it carries on where it was.

const Form = ({ draft }: { draft: string }) => {
	const [text, setText, clear] = useDraft(draft, "");
	const location = useLocation();
	return (
		<div>
			<span data-testid="path">{location.pathname}</span>
			<input
				aria-label="text"
				value={text}
				onChange={(event) => setText(event.target.value)}
			/>
			<button type="button" onClick={clear}>
				saved
			</button>
		</div>
	);
};

const open = async (hash = "", draft = "task.new.text") => {
	window.location.hash = hash;
	const host = document.createElement("div");
	document.body.appendChild(host);
	const root = createRoot(host);
	await act(async () =>
		root.render(
			<MemoryRouter initialEntries={["/home/new-task"]}>
				<UIStateProvider>
					<Form draft={draft} />
				</UIStateProvider>
			</MemoryRouter>,
		),
	);
	// The remembered state is read before anything is drawn.
	await act(async () => {});
	const input = host.querySelector("input")!;
	const type = async (value: string) => {
		const setter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)!.set!;
		await act(async () => {
			setter.call(input, value);
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
	};
	return {
		input,
		type,
		host,
		close: () => {
			root.unmount();
			host.remove();
		},
	};
};

beforeEach(() => {
	sessionStorage.clear();
	window.location.hash = "";
});

describe("what the popup remembers", () => {
	it("keeps what was typed across a close and reopen", async () => {
		const first = await open();
		await first.type("Call the bank");
		first.close();

		const second = await open();
		expect(second.input.value).toBe("Call the bank");
		second.close();
	});

	it("forgets a draft once it is saved", async () => {
		const first = await open();
		await first.type("Call the bank");
		await act(async () => first.host.querySelector("button")!.click());
		first.close();

		const second = await open();
		expect(second.input.value).toBe("");
		second.close();
	});

	it("keeps both drafts when two pages are open at once", async () => {
		// The popup and an extension tab, each loaded before the other typed.
		const popup = await open("", "task.new.text");
		const tab = await open("", "note.new.text");
		await popup.type("Call the bank");
		await tab.type("Buy stamps");
		popup.close();
		tab.close();

		const state = await readUIState();
		expect(state.drafts["task.new.text"]).toBe("Call the bank");
		expect(state.drafts["note.new.text"]).toBe("Buy stamps");
	});

	it("remembers the page it was on", async () => {
		const view = await open();
		view.close();
		const state = await readUIState();
		expect(state.route?.path).toBe("/home/new-task");
	});

	it("reopens a recent page, but not an old one or a password screen", () => {
		const at = 1_000_000;
		const state = {
			route: { path: "/home/new-task", at },
			drafts: {},
		};
		expect(routeToRestore(state, at + ROUTE_MAX_AGE_MS)).toBe(
			"/home/new-task",
		);
		expect(routeToRestore(state, at + ROUTE_MAX_AGE_MS + 1)).toBeNull();
		for (const path of ["/", "/lock", "/unlock/abc", "/browse-profiles"]) {
			expect(isRememberedRoute(path)).toBe(false);
		}
		expect(isRememberedRoute("/new-profile")).toBe(true);
	});

	it("is forgotten when the profile locks", async () => {
		const view = await open();
		await view.type("Private thought");
		view.close();
		const remembered = () =>
			Object.keys(sessionStorage).filter((key) =>
				key.startsWith(UI_STATE_PREFIX),
			);
		expect(remembered()).not.toEqual([]);

		await createWebSessionStore(sessionStorage).clear();
		expect(remembered()).toEqual([]);
	});
});
