import { act, useEffect, useReducer } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileKeys } from "../../src/storage/keys";
import { useRecordsSource } from "../../src/popup/hooks/useRecords";

// A background write (the worker capturing the page in view, a reminder
// firing) re-runs the popup's live queries. The lists must stay in place
// while the changed rows are opened: when they went undefined for a
// moment, the home page unmounted everything under it and the user lost
// the form, list position or page they were on.

const live = vi.hoisted(() => ({ rows: undefined as unknown }));
const opened = vi.hoisted(() => ({
	gate: Promise.resolve() as Promise<void>,
	failing: new Set<string>(),
}));

vi.mock("dexie-react-hooks", () => ({ useLiveQuery: () => live.rows }));
vi.mock("../../src/storage/keys", () => ({
	openBody: async (_keys: unknown, _table: string, id: string) => {
		await opened.gate;
		if (opened.failing.has(id)) {
			throw new Error("Envelope did not authenticate.");
		}
		return { content: `text of ${id}` };
	},
}));

const keys = { profileId: "p1" } as ProfileKeys;

// A sealed row: bytes 5 to 16 are the IV, which changes on every write.
const row = (id: string, version: number) => ({
	id,
	profileId: "p1",
	updatedAt: version,
	createdAt: 0,
	body: new Uint8Array(40).fill(version),
});

const mount = async () => {
	const seen: Array<Array<{ id: string }> | undefined> = [];
	let rerender = () => {};
	const Probe = ({ profileKeys }: { profileKeys: ProfileKeys | null }) => {
		const [, force] = useReducer((n: number) => n + 1, 0);
		const { notes } = useRecordsSource(profileKeys);
		useEffect(() => {
			rerender = force;
		});
		seen.push(notes);
		return null;
	};
	const root = createRoot(document.createElement("div"));
	await act(async () => root.render(<Probe profileKeys={keys} />));
	return {
		seen,
		refresh: () => act(async () => rerender()),
		lock: () => act(async () => root.render(<Probe profileKeys={null} />)),
		unmount: () => root.unmount(),
	};
};

beforeEach(() => {
	opened.gate = Promise.resolve();
	opened.failing.clear();
});

describe("the popup's record lists", () => {
	it("stay in place while a background write is being read", async () => {
		live.rows = [row("a", 1), row("b", 1)];
		const view = await mount();
		expect(view.seen.at(-1)?.map((note) => note.id)).toEqual(["a", "b"]);

		// The worker rewrites one row; opening it takes a moment.
		let release = () => {};
		opened.gate = new Promise((resolve) => (release = resolve));
		live.rows = [row("a", 2), row("b", 1), row("c", 1)];
		const from = view.seen.length;
		await view.refresh();
		// Nothing rendered in between was an empty or missing list.
		expect(view.seen.slice(from).length).toBeGreaterThan(0);
		for (const notes of view.seen.slice(from)) {
			expect(notes?.map((note) => note.id)).toEqual(["a", "b"]);
		}

		await act(async () => release());
		expect(view.seen.at(-1)?.map((note) => note.id)).toEqual([
			"a",
			"b",
			"c",
		]);
		view.unmount();
	});

	it("skip a row that cannot be opened instead of hiding the rest", async () => {
		opened.failing.add("broken");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		live.rows = [row("a", 1), row("broken", 1), row("b", 1)];
		const view = await mount();
		expect(view.seen.at(-1)?.map((note) => note.id)).toEqual(["a", "b"]);
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
		view.unmount();
	});

	it("are dropped when the profile locks", async () => {
		live.rows = [row("a", 1)];
		const view = await mount();
		expect(view.seen.at(-1)).toHaveLength(1);
		await view.lock();
		expect(view.seen.at(-1)).toBeUndefined();
		view.unmount();
	});
});
