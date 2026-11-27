import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { File as NodeFile } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAI_PROVIDERS, LTHEME } from "little-shared/enums";
import {
	asPickedFiles,
	pickKey,
	pickRoute,
	type PickRequest,
} from "../../src/popup/filePick";
import {
	UIStateContext,
	type UIStateStore,
} from "../../src/popup/contexts/UIStateContext";
import { ThemeContext } from "../../src/popup/contexts/ThemeContext";
import { LUIFileInput } from "../../src/popup/pages/LUIFileInput/Page";
import { usePickedFile } from "../../src/popup/hooks/usePickedFile";
import { LUIAISettings } from "../../src/popup/pages/LUIAISettings/Page";
import {
	exportObsidianMarkdown,
	importBookmarksHtml,
} from "../../src/services/portable";
import { littleDB } from "../../src/storage/pageDB";
import { sessionStore } from "../../src/storage/session";
import { staging } from "../../src/storage/staging";
import { send } from "../../src/utils/send";
import * as saveFileModule from "../../src/utils/saveFile";

const SENSITIVE_REQUEST: PickRequest = {
	title: "Import bookmarks",
	accepts: "HTML bookmark export",
	types: null,
	maxBytes: 1024 * 1024,
	maxFiles: 1,
	pasteHint: "Paste a bookmarks.html file",
	sensitive: true,
};

const memoryStore = (): UIStateStore & { drafts: Map<string, unknown> } => {
	const drafts = new Map<string, unknown>();
	return {
		drafts,
		getDraft: (key) => drafts.get(key),
		setDraft: (key, value) => void drafts.set(key, value),
		clearDraft: (key) => void drafts.delete(key),
		clearDrafts: () => drafts.clear(),
		rememberRoute: () => {},
	};
};

const themeValue = {
	theme: LTHEME.LIGHT,
	toggleTheme: () => {},
	setTheme: () => {},
	preference: "light" as const,
	setPreference: () => {},
	accent: "mono" as const,
	setAccent: () => {},
	accentColor: "#0e7490",
	setAccentColor: () => {},
	showLookOf: () => {},
};

const pasteFile = async (file: InstanceType<typeof NodeFile>) => {
	const event = new Event("paste", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "clipboardData", { value: { files: [file] } });
	await act(async () => {
		document.dispatchEvent(event);
	});
	await act(async () => new Promise((resolve) => setTimeout(resolve, 25)));
};

describe("security hardening — UI staging, owner-bound portable I/O & origin-bound AI key", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		(
			globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
		).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		await littleDB.open();
		await sessionStore.clear();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await act(async () => root.unmount());
		container.remove();
		await sessionStore.clear();
	});

	it("encrypts sensitive file picks in staging, refuses when locked, and blocks cross-session reads", async () => {
		const store = memoryStore();
		const renderPicker = async () => {
			await act(async () => {
				root.render(
					<ThemeContext.Provider value={themeValue}>
						<UIStateContext.Provider value={store}>
							<MemoryRouter
								initialEntries={[
									pickRoute(
										SENSITIVE_REQUEST,
										"bookmarks-html",
										"/settings/privacy",
									),
								]}
							>
								<Routes>
									<Route
										path="/pick-file"
										element={<LUIFileInput />}
									/>
									<Route
										path="/settings/privacy"
										element={<div data-testid="done" />}
									/>
								</Routes>
							</MemoryRouter>
						</UIStateContext.Provider>
					</ThemeContext.Provider>,
				);
			});
		};

		// While locked, sensitive pick fails closed and stages nothing.
		await renderPicker();
		const secretHtml =
			"<html><a href='https://secret.test'>My Secret</a></html>";
		await pasteFile(
			new NodeFile([secretHtml], "bookmarks.html", { type: "text/html" }),
		);
		expect(container.textContent).toContain("Unlock your profile");
		expect(store.drafts.size).toBe(0);

		// Unlock a profile and stage the sensitive file.
		await send("profile.create", { name: "Ada", password: null });
		const sessionA = (await sessionStore.get())!;
		await pasteFile(
			new NodeFile([secretHtml], "bookmarks.html", { type: "text/html" }),
		);
		const uploadBtn = Array.from(container.querySelectorAll("button")).find(
			(b) => b.textContent?.includes("Upload"),
		);
		await act(async () => uploadBtn!.click());

		const picked = asPickedFiles(
			store.drafts.get(pickKey("bookmarks-html")),
		);
		expect(picked).toHaveLength(1);
		expect(picked[0]).toMatchObject({
			encrypted: true,
			profileId: sessionA.profileId,
			unlockId: sessionA.unlockId,
		});

		// Raw staged bytes must not contain plaintext.
		const raw = await staging.read(picked[0]!.file);
		expect(new TextDecoder().decode(raw)).not.toContain("secret.test");

		// Matching session reads decrypted text and carries the verified owner.
		let readText = "";
		let readOwner: { profileId: string; unlockId: string } | undefined;
		const Reader = () => {
			const res = usePickedFile("bookmarks-html", { sensitive: true });
			if (res.files[0]) {
				readOwner = res.files[0].owner;
				void res.files[0].blob.text().then((t) => {
					readText = t;
				});
			}
			return null;
		};
		await act(async () => {
			root.render(
				<UIStateContext.Provider value={store}>
					<Reader />
				</UIStateContext.Provider>,
			);
		});
		await vi.waitFor(() => expect(readText).toBe(secretHtml));
		expect(readOwner).toEqual({
			profileId: sessionA.profileId,
			unlockId: sessionA.unlockId,
		});

		// Switching to another profile causes usePickedFile to fail closed and clear draft,
		// and passing Ada's owner to importBookmarksHtml under Bea rejects immediately.
		await send("profile.create", { name: "Bea", password: null });
		await expect(
			importBookmarksHtml(secretHtml, readOwner),
		).rejects.toThrow(/locked/i);
		let readByBea = false;
		const BeaReader = () => {
			const res = usePickedFile("bookmarks-html", { sensitive: true });
			if (res.blob) readByBea = true;
			return null;
		};
		await act(async () => {
			root.render(
				<UIStateContext.Provider value={store}>
					<BeaReader />
				</UIStateContext.Provider>,
			);
		});
		await vi.waitFor(() =>
			expect(store.drafts.has(pickKey("bookmarks-html"))).toBe(false),
		);
		expect(readByBea).toBe(false);
	});

	it("aborts bookmark import and portable export if the session locks mid-operation", async () => {
		await send("profile.create", { name: "Ada", password: null });
		const html = `
			<!DOCTYPE NETSCAPE-Bookmark-file-1>
			<DL><p>
				<DT><A HREF="https://one.example">One</A>
				<DT><A HREF="https://two.example">Two</A>
			</DL><p>
		`;
		// Lock session right after first bookmark import call.
		const origGet = sessionStore.get.bind(sessionStore);
		let calls = 0;
		vi.spyOn(sessionStore, "get").mockImplementation(async () => {
			calls += 1;
			if (calls >= 3) {
				return null;
			}
			return origGet();
		});
		await expect(importBookmarksHtml(html)).rejects.toThrow(/locked/i);

		// Restore and test exportObsidianMarkdown re-checking session before saveFile.
		vi.restoreAllMocks();
		const saveSpy = vi
			.spyOn(saveFileModule, "saveFile")
			.mockResolvedValue(undefined);
		let exportCalls = 0;
		vi.spyOn(sessionStore, "get").mockImplementation(async () => {
			exportCalls += 1;
			return exportCalls === 1 ? origGet() : null;
		});
		await expect(exportObsidianMarkdown()).rejects.toThrow(/locked/i);
		expect(saveSpy).not.toHaveBeenCalled();
	});

	it("clears the AI API key when switching to another provider or changing Base URL origin, but keeps it for same-origin path edits", async () => {
		await send("profile.create", { name: "Ada", password: null });
		await send("settings.update", {
			ai: {
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "https://api.openai.com/v1",
				apiKey: "sk-openai-secret",
				model: "gpt-4o",
			},
		});

		await act(async () => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<UIStateContext.Provider value={memoryStore()}>
						<MemoryRouter initialEntries={["/settings/ai"]}>
							<Routes>
								<Route
									path="/settings/ai"
									element={<LUIAISettings />}
								/>
							</Routes>
						</MemoryRouter>
					</UIStateContext.Provider>
				</ThemeContext.Provider>,
			);
		});

		const findInputs = () => {
			const baseUrl =
				container.querySelector<HTMLInputElement>('input[type="url"]');
			const apiKey = container.querySelector<HTMLInputElement>(
				'input[type="password"]',
			);
			return { baseUrl, apiKey };
		};

		await vi.waitFor(() => {
			const { apiKey } = findInputs();
			expect(apiKey?.value).toBe("sk-openai-secret");
		});

		const setInputValue = async (
			input: HTMLInputElement,
			value: string,
		) => {
			await act(async () => {
				const setter = Object.getOwnPropertyDescriptor(
					window.HTMLInputElement.prototype,
					"value",
				)?.set;
				setter?.call(input, value);
				input.dispatchEvent(new Event("input", { bubbles: true }));
				input.dispatchEvent(new Event("change", { bubbles: true }));
			});
		};

		// Same-origin path edit keeps the API key.
		await setInputValue(findInputs().baseUrl!, "https://api.openai.com/v2");
		expect(findInputs().apiKey?.value).toBe("sk-openai-secret");

		// Switching to the Cloud tab and picking another provider clears the API key.
		const cloudTab = Array.from(
			container.querySelectorAll('[role="tab"]'),
		).find((b) => b.textContent?.trim() === "Cloud") as
			HTMLButtonElement | undefined;
		expect(cloudTab).toBeTruthy();
		await act(async () => cloudTab!.click());
		const deepSeekBtn = Array.from(
			container.querySelectorAll("button"),
		).find((b) => b.textContent?.trim() === "DeepSeek");
		expect(deepSeekBtn).toBeTruthy();
		await act(async () => deepSeekBtn!.click());
		expect(findInputs().baseUrl?.value).toBe("https://api.deepseek.com/v1");
		expect(findInputs().apiKey?.value).toBe("");

		// Setting a new key on DeepSeek binds to DeepSeek's origin; editing to
		// an arbitrary different host clears it immediately.
		await setInputValue(findInputs().apiKey!, "sk-deepseek-secret");
		expect(findInputs().apiKey?.value).toBe("sk-deepseek-secret");
		await setInputValue(findInputs().baseUrl!, "https://evil.example/v1");
		expect(findInputs().apiKey?.value).toBe("");
	});

	it("preserves origin binding when restoring an unsaved AI settings draft over an empty saved key", async () => {
		await send("profile.create", { name: "Ada", password: null });
		await send("settings.update", {
			ai: {
				provider: LAI_PROVIDERS.CUSTOM,
				baseUrl: "https://api.openai.com/v1",
				apiKey: "",
				model: "gpt-4o",
			},
		});

		const store = memoryStore();
		store.setDraft("settings.ai", {
			provider: LAI_PROVIDERS.CUSTOM,
			baseUrl: "https://api.openai.com/v1",
			apiKey: "sk-unsaved-draft-key",
			model: "gpt-4o",
		});

		await act(async () => {
			root.render(
				<ThemeContext.Provider value={themeValue}>
					<UIStateContext.Provider value={store}>
						<MemoryRouter initialEntries={["/settings/ai"]}>
							<Routes>
								<Route
									path="/settings/ai"
									element={<LUIAISettings />}
								/>
							</Routes>
						</MemoryRouter>
					</UIStateContext.Provider>
				</ThemeContext.Provider>,
			);
		});

		const findInputs = () => ({
			baseUrl:
				container.querySelector<HTMLInputElement>('input[type="url"]'),
			apiKey: container.querySelector<HTMLInputElement>(
				'input[type="password"]',
			),
		});

		await vi.waitFor(() => {
			expect(findInputs().apiKey?.value).toBe("sk-unsaved-draft-key");
		});

		await act(async () => {
			const setter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype,
				"value",
			)?.set;
			const input = findInputs().baseUrl!;
			setter?.call(input, "https://other.example/v1");
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(findInputs().apiKey?.value).toBe("");
	});
});
