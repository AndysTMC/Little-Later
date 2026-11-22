import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { File as NodeFile } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	asPickedFiles,
	parsePickRequest,
	pendingPickKey,
	pickKey,
	pickProblem,
	pickRoute,
	stagedFilesInUse,
	type PickRequest,
} from "../../src/popup/filePick";
import {
	UIStateContext,
	type UIStateStore,
} from "../../src/popup/contexts/UIStateContext";
import { LUIFileInput } from "../../src/popup/pages/LUIFileInput/Page";

vi.mock("../../src/popup/hooks/useTheme", () => ({
	useTheme: () => ({ theme: "little-light" }),
}));

const PHOTO: PickRequest = {
	title: "Add a photo",
	accepts: "A PNG image, up to 1 KB",
	types: ["image/png"],
	maxBytes: 1024,
	maxFiles: 1,
	pasteHint: "Copy an image, then press Ctrl+V",
};
const BACKUPS: PickRequest = {
	...PHOTO,
	title: "Upload backups",
	types: null,
	maxFiles: 2,
};

describe("a pick request", () => {
	it("comes back from its route as it was sent", () => {
		const route = pickRoute(PHOTO, "avatar.new", "/new-profile");
		const params = new URLSearchParams(route.split("?")[1]);
		expect(route.startsWith("/pick-file?")).toBe(true);
		expect(parsePickRequest(params.get("request"))).toEqual(PHOTO);
		expect(params.get("slot")).toBe("avatar.new");
		expect(params.get("returnTo")).toBe("/new-profile");
	});

	// It arrives in the address, so anything else is refused, not trusted.
	it.each([
		["nothing", null],
		["not JSON", "{"],
		["no title", JSON.stringify({ ...PHOTO, title: "" })],
		["no size limit", JSON.stringify({ ...PHOTO, maxBytes: 0 })],
		["no files", JSON.stringify({ ...PHOTO, maxFiles: 0 })],
		["too many files", JSON.stringify({ ...PHOTO, maxFiles: 101 })],
		["types not text", JSON.stringify({ ...PHOTO, types: [1] })],
	])("is refused with %s", (_, text) => {
		expect(parsePickRequest(text)).toBeNull();
	});
});

describe("whether a file fits a request", () => {
	it("refuses an empty file, a wrong type and a large file, each by name", () => {
		expect(pickProblem(PHOTO, { type: "image/png", size: 0 })).toMatch(
			"empty",
		);
		expect(pickProblem(PHOTO, { type: "text/plain", size: 5 })).toMatch(
			"not a file this accepts",
		);
		expect(pickProblem(PHOTO, { type: "image/png", size: 1025 })).toMatch(
			"too large",
		);
		expect(
			pickProblem(PHOTO, { type: "image/png", size: 1024 }),
		).toBeNull();
	});

	it("takes any type when the asking screen checks the content", () => {
		expect(
			pickProblem(BACKUPS, { type: "application/x-anything", size: 9 }),
		).toBeNull();
	});
});

describe("staged files the remembered state holds", () => {
	it("are the pasted and the uploaded ones, and nothing else", () => {
		const file = (name: string) => ({
			file: name,
			type: "image/png",
			name,
			size: 1,
		});
		expect(
			stagedFilesInUse({
				[pendingPickKey("a")]: [file("pasted")],
				[pickKey("b")]: [file("uploaded")],
				"note.draft": [file("not-a-pick")],
				[pickKey("c")]: "junk",
			}),
		).toEqual(new Set(["pasted", "uploaded"]));
		expect(asPickedFiles(file("one"))).toHaveLength(1);
	});
});

// A store like the remembered state's, kept across renders so a test can
// close the screen and open it again.
const memoryStore = (): UIStateStore & { drafts: Map<string, unknown> } => {
	const drafts = new Map<string, unknown>();
	return {
		drafts,
		getDraft: (key) => drafts.get(key),
		setDraft: (key, value) => void drafts.set(key, value),
		clearDraft: (key) => void drafts.delete(key),
		clearDrafts: () => {},
		rememberRoute: () => {},
	};
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
	act(() => root?.unmount());
	container?.remove();
	root = null;
	container = null;
});

const Asker = () => {
	const location = useLocation();
	return (
		<output data-testid="asker">
			{location.pathname} {String(location.state?.move)}
		</output>
	);
};

const open = async (store: UIStateStore, request: PickRequest) => {
	act(() => root?.unmount());
	container?.remove();
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
	await act(async () =>
		root!.render(
			<UIStateContext.Provider value={store}>
				<MemoryRouter
					initialEntries={[pickRoute(request, "slot", "/asker")]}
				>
					<Routes>
						<Route path="/pick-file" element={<LUIFileInput />} />
						<Route path="/asker" element={<Asker />} />
					</Routes>
				</MemoryRouter>
			</UIStateContext.Provider>,
		),
	);
	return container;
};

const png = (name: string) =>
	new NodeFile([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

// Chrome's paste event, carrying files.
const paste = async (...files: Array<InstanceType<typeof NodeFile>>) => {
	const event = new Event("paste", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "clipboardData", { value: { files } });
	await act(async () => {
		document.dispatchEvent(event);
	});
	// Staging reads each file before it is listed.
	await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};

const listed = (view: HTMLElement) =>
	Array.from(view.querySelectorAll("[data-testid='upload-area'] li")).map(
		(item) => item.querySelector("span")?.textContent,
	);

describe("the upload screen", () => {
	it("keeps only the newest paste when one file is asked for", async () => {
		const view = await open(memoryStore(), PHOTO);
		await paste(png("first.png"));
		await paste(png("second.png"));
		expect(listed(view)).toEqual(["second.png"]);
	});

	it("stops at the number of files asked for, and says so", async () => {
		const view = await open(memoryStore(), BACKUPS);
		await paste(png("a.png"), png("b.png"), png("c.png"));
		expect(listed(view)).toEqual(["a.png", "b.png"]);
		expect(view.querySelector("[role='alert']")?.textContent).toContain(
			"Only 2 files",
		);
	});

	// Chrome closes the toolbar popup whenever it loses focus.
	it("still lists a pasted file after the popup closes and reopens", async () => {
		const store = memoryStore();
		await open(store, PHOTO);
		await paste(png("kept.png"));
		const view = await open(store, PHOTO);
		expect(listed(view)).toEqual(["kept.png"]);
	});

	it("hands the files to the asking screen on Upload, zooming back in", async () => {
		const store = memoryStore();
		const view = await open(store, PHOTO);
		await paste(png("me.png"));
		const upload = Array.from(view.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Upload"),
		);
		await act(async () => upload!.click());
		expect(view.querySelector("[data-testid='asker']")?.textContent).toBe(
			"/asker into",
		);
		expect(asPickedFiles(store.drafts.get(pickKey("slot")))).toMatchObject([
			{ name: "me.png", type: "image/png", size: 3 },
		]);
		expect(store.drafts.has(pendingPickKey("slot"))).toBe(false);
	});

	it("explains instead of failing when the request is broken", async () => {
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		await act(async () =>
			root!.render(
				<MemoryRouter initialEntries={["/pick-file?request=%7B"]}>
					<Routes>
						<Route path="/pick-file" element={<LUIFileInput />} />
					</Routes>
				</MemoryRouter>,
			),
		);
		expect(container.textContent).toContain("Nothing was asked for here.");
	});
});
