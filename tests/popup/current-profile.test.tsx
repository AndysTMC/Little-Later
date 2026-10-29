import { act, useEffect, useReducer } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { ProfileRow } from "../../src/storage/schema";
import { useCurrentUserProfile } from "../../src/popup/hooks/useCurrentUserProfile";
import { useCurrentUserSettings } from "../../src/popup/hooks/useCurrentUserSettings";

// The live query hands back the same row until the row changes.
const row = {
	id: "p1",
	name: "Ada",
	protection: "none",
	prefs: { theme: "light", autoLockMinutes: 30 },
} as ProfileRow;

const live = vi.hoisted(() => ({ value: undefined as unknown }));
const keys = { profileId: "p1" };

vi.mock("dexie-react-hooks", () => ({ useLiveQuery: () => live.value }));
vi.mock("../../src/popup/hooks/useSession", () => ({
	useSession: () => ({
		isResolved: true,
		session: { profileId: "p1" },
	}),
	useProfileKeys: () => keys,
}));

// Renders the hook a few times and returns what it gave each time.
const valuesAcrossRenders = async <T,>(useValue: () => T) => {
	const seen: Array<T> = [];
	let rerender = () => {};
	const Probe = () => {
		const [, force] = useReducer((n: number) => n + 1, 0);
		const value = useValue();
		useEffect(() => {
			rerender = force;
		});
		seen.push(value);
		return null;
	};
	const root = createRoot(document.createElement("div"));
	await act(async () => root.render(<Probe />));
	await act(async () => rerender());
	await act(async () => rerender());
	root.unmount();
	return seen;
};

describe("the unlocked profile", () => {
	// Pages navigate in effects that depend on it, so a new object on
	// every render re-ran them on every render: the intro page sent the
	// popup to /home over and over while it animated out.
	it("keeps its identity across renders while its row is unchanged", async () => {
		live.value = row;
		const seen = await valuesAcrossRenders(useCurrentUserProfile);
		expect(seen.length).toBeGreaterThan(2);
		expect(new Set(seen).size).toBe(1);
		expect(seen[0]).toMatchObject({ id: "p1", name: "Ada" });
	});
});

describe("the unlocked profile's settings", () => {
	// The misc settings page copies them into its state in an effect, so
	// new default settings on every render looped until the page froze.
	it("keep their identity across renders when the profile has none stored", async () => {
		live.value = null;
		const seen = await valuesAcrossRenders(useCurrentUserSettings);
		expect(seen.length).toBeGreaterThan(2);
		expect(new Set(seen).size).toBe(1);
		expect(seen[0]).toMatchObject({ misc: expect.any(Object) });
	});
});
