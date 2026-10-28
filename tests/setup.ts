import { Temporal as TemporalPolyfill } from "@js-temporal/polyfill";
import { Blob as NodeBlob } from "node:buffer";

// jsdom's Blob has no arrayBuffer() and cannot be structured-cloned by
// fake-indexeddb, so vault encrypt/decrypt tests would store empty objects.
// Prefer the Node/Bun Blob implementation in every test environment.
const probe = new NodeBlob([new Uint8Array([1])]);
if (typeof probe.arrayBuffer === "function") {
	globalThis.Blob = NodeBlob as unknown as typeof Blob;
}

class TestFileReader {
	result: string | ArrayBuffer | null = null;
	error: Error | null = null;
	onload: ((this: TestFileReader, ev?: unknown) => void) | null = null;
	onerror: ((this: TestFileReader, ev?: unknown) => void) | null = null;

	readAsArrayBuffer(blob: Blob) {
		void this.read(blob, "arrayBuffer");
	}

	readAsText(blob: Blob) {
		void this.read(blob, "text");
	}

	private emit(
		handler: ((this: TestFileReader, ev?: unknown) => void) | null,
	) {
		handler?.call(this, { target: this });
	}

	private bytesFromFakeBlob(blob: unknown): Uint8Array | null {
		if (!blob || typeof blob !== "object" || !("data" in blob)) {
			return null;
		}
		const data = (blob as { data?: unknown }).data;
		if (data instanceof Uint8Array) {
			return data;
		}
		if (Array.isArray(data)) {
			return Uint8Array.from(
				data.filter(
					(item): item is number =>
						typeof item === "number" && Number.isFinite(item),
				),
			);
		}
		return null;
	}

	private async read(blob: Blob, mode: "arrayBuffer" | "text") {
		try {
			const fakeBytes = this.bytesFromFakeBlob(blob);
			if (fakeBytes) {
				this.result =
					mode === "arrayBuffer"
						? fakeBytes.buffer.slice(
								fakeBytes.byteOffset,
								fakeBytes.byteOffset + fakeBytes.byteLength,
							)
						: new TextDecoder().decode(fakeBytes);
				this.emit(this.onload);
				return;
			}
			if (typeof blob.arrayBuffer !== "function") {
				throw new Error("Not a readable blob.");
			}
			this.result =
				mode === "arrayBuffer"
					? await blob.arrayBuffer()
					: await blob.text();
			this.emit(this.onload);
		} catch (error) {
			this.error =
				error instanceof Error ? error : new Error(String(error));
			this.emit(this.onerror);
		}
	}
}

const fileReaderUnderstandsNodeBlob = (): boolean => {
	if (typeof FileReader !== "function") {
		return false;
	}
	try {
		const reader = new FileReader();
		reader.readAsArrayBuffer(probe);
		return true;
	} catch {
		return false;
	}
};

if (!fileReaderUnderstandsNodeBlob()) {
	globalThis.FileReader = TestFileReader as unknown as typeof FileReader;
}

export {};

// The extension relies on Chrome's built-in Temporal (decision 0011). Node
// and jsdom do not have it yet, so tests use the polyfill until they do.
// The polyfill's namespace is frozen; the built-in one is not, and fake
// timers replace its `Now`, so tests get a copy with the built-in's
// property attributes.
if (!("Temporal" in globalThis)) {
	const temporal = Object.create(Object.getPrototypeOf(TemporalPolyfill));
	for (const key of Reflect.ownKeys(TemporalPolyfill)) {
		Object.defineProperty(temporal, key, {
			value: TemporalPolyfill[key as keyof typeof TemporalPolyfill],
			configurable: true,
			writable: true,
			enumerable: false,
		});
	}
	Object.defineProperty(globalThis, "Temporal", {
		value: temporal,
		configurable: true,
		writable: true,
	});
}
