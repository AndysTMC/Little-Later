// Binary input never crosses a runtime message (decision 0012, Messaging):
// the page writes the bytes to a staging file in the origin private file
// system and sends the file's name; the worker takes the file, which reads
// and deletes it. Outside production the page and the handlers share one
// context, so staging lives in memory.
//
// Only inputs that 0012 stages as they are use this today: a profile avatar
// (plain for the lock screen) and a `.lldat` backup (already encrypted).

const STAGING_DIR = "staging";
const NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class StagingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StagingError";
	}
}

export type Staging = {
	// Page side: stores the bytes and returns the file's name.
	put: (bytes: Uint8Array<ArrayBuffer>) => Promise<string>;
	// Worker side: returns the bytes and deletes the file.
	take: (name: string) => Promise<Uint8Array<ArrayBuffer>>;
	// Deletes files staged before `before` (epoch ms): those a closed or
	// crashed page left behind. Newer files may belong to a command still
	// on its way, which a sweep at worker start would otherwise race.
	sweep: (before: number) => Promise<void>;
};

// Staged files older than this are leftovers. A page sends its command
// right after staging, so this is far longer than any real wait.
export const STAGED_FILE_MAX_AGE = 10 * 60_000;

const assertName = (name: string) => {
	if (!NAME.test(name)) {
		throw new StagingError("Not a staging file name.");
	}
};

export const createMemoryStaging = (
	now: () => number = () => Date.now(),
): Staging => {
	const files = new Map<
		string,
		{ bytes: Uint8Array<ArrayBuffer>; stagedAt: number }
	>();
	return {
		put: async (bytes) => {
			const name = crypto.randomUUID();
			files.set(name, { bytes: bytes.slice(), stagedAt: now() });
			return name;
		},
		take: async (name) => {
			assertName(name);
			const file = files.get(name);
			if (!file) {
				throw new StagingError("The staged file is gone.");
			}
			files.delete(name);
			return file.bytes;
		},
		sweep: async (before) => {
			for (const [name, file] of files) {
				if (file.stagedAt < before) {
					files.delete(name);
				}
			}
		},
	};
};

export const createOpfsStaging = (): Staging => {
	const directory = async () =>
		(await navigator.storage.getDirectory()).getDirectoryHandle(
			STAGING_DIR,
			{ create: true },
		);
	return {
		put: async (bytes) => {
			const name = crypto.randomUUID();
			const file = await (
				await directory()
			).getFileHandle(name, { create: true });
			const writable = await file.createWritable();
			await writable.write(bytes);
			await writable.close();
			return name;
		},
		take: async (name) => {
			assertName(name);
			const dir = await directory();
			let file: FileSystemFileHandle;
			try {
				file = await dir.getFileHandle(name);
			} catch {
				throw new StagingError("The staged file is gone.");
			}
			const bytes = new Uint8Array(
				await (await file.getFile()).arrayBuffer(),
			);
			await dir.removeEntry(name);
			return bytes;
		},
		sweep: async (before) => {
			const dir = await directory();
			for await (const entry of dir.values()) {
				if (entry.kind !== "file") {
					continue;
				}
				await (entry as FileSystemFileHandle)
					.getFile()
					.then((file) =>
						file.lastModified < before
							? dir.removeEntry(entry.name)
							: undefined,
					)
					.catch((error: unknown) => {
						// Its command took the file meanwhile.
						if (
							!(error instanceof DOMException) ||
							error.name !== "NotFoundError"
						) {
							throw error;
						}
					});
			}
		},
	};
};

export const staging: Staging =
	import.meta.env.MODE === "production"
		? createOpfsStaging()
		: createMemoryStaging();
