import { describe, expect, it, vi } from "vitest";
import {
	createChromeSessionStore,
	createMemorySessionStore,
	fromBase64,
	toBase64,
	type UnlockedSession,
} from "../../src/storage/session";

const unlocked: UnlockedSession = {
	profileId: "p",
	currentKeyId: 1,
	rootKeys: { "1": toBase64(new Uint8Array(32).fill(7)) },
	indexKey: toBase64(new Uint8Array(32).fill(9)),
};

describe("memory session store", () => {
	it("broadcasts unlock and lock to subscribers", async () => {
		const store = createMemorySessionStore();
		const seen: Array<string | null> = [];
		const stop = store.subscribe((s) => seen.push(s?.profileId ?? null));
		await store.set(unlocked);
		await store.clear();
		stop();
		await store.set(unlocked);
		expect(seen).toEqual(["p", null]);
	});
});

describe("chrome session store", () => {
	it("uses storage.session and never changes its access level", async () => {
		const data: Record<string, unknown> = {};
		const session = {
			get: vi.fn(async (key: string) => ({ [key]: data[key] })),
			set: vi.fn(async (items: Record<string, unknown>) => {
				Object.assign(data, items);
			}),
			remove: vi.fn(async (key: string) => {
				delete data[key];
			}),
			setAccessLevel: vi.fn(),
			onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
		};
		vi.stubGlobal("chrome", { storage: { session } });
		try {
			const store = createChromeSessionStore();
			await store.set(unlocked);
			expect(await store.get()).toEqual(unlocked);
			await store.clear();
			expect(await store.get()).toBeNull();
			expect(session.setAccessLevel).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe("base64", () => {
	it("round-trips every byte value", () => {
		const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
		expect(fromBase64(toBase64(bytes))).toEqual(bytes);
	});
});
