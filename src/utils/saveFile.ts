// A file for the user to save: an export or a backup. A page saves it
// itself. The worker has no page to save from (LittleAI's export runs
// there, decision 0017), so it hands the file to one open extension page:
// each page that hears it offers to take it, the focused page first, and
// the worker gives it to the first that offered. Only one saves it.

const CHANNEL = "little/files";
// How long the worker waits for a page to take the file.
const CLAIM_TIMEOUT_MS = 5_000;
// A page without focus offers later, so the one the user is in wins.
const UNFOCUSED_DELAY_MS = 250;

type FileMessage =
	| {
			kind: "file";
			id: string;
			filename: string;
			bytes: ArrayBuffer;
			type: string;
	  }
	| { kind: "claim"; id: string; page: string }
	| { kind: "grant"; id: string; page: string };

export class NoPageToSaveError extends Error {
	constructor() {
		super(
			"There was no Little Later page open to save the file. Open LittleAI and try again.",
		);
		this.name = "NoPageToSaveError";
	}
}

export const saveInPage = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	document.body.removeChild(anchor);
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

// From the worker: resolves once a page has taken the file.
export const handToPage = async (
	blob: Blob,
	filename: string,
): Promise<void> => {
	const bytes = await blob.arrayBuffer();
	return new Promise((resolve, reject) => {
		const channel = new BroadcastChannel(CHANNEL);
		const id = crypto.randomUUID();
		const timer = setTimeout(() => {
			channel.close();
			reject(new NoPageToSaveError());
		}, CLAIM_TIMEOUT_MS);
		channel.onmessage = (event: MessageEvent<FileMessage>) => {
			const message = event.data;
			if (message.kind !== "claim" || message.id !== id) return;
			clearTimeout(timer);
			channel.postMessage({
				kind: "grant",
				id,
				page: message.page,
			} satisfies FileMessage);
			channel.close();
			resolve();
		};
		channel.postMessage({
			kind: "file",
			id,
			filename,
			bytes,
			type: blob.type,
		} satisfies FileMessage);
	});
};

// In a page: saves the files the worker hands over when it is given them.
export const listenForFiles = (
	save: (blob: Blob, filename: string) => void = saveInPage,
	focused: () => boolean = () => document.hasFocus(),
): (() => void) => {
	const channel = new BroadcastChannel(CHANNEL);
	const page = crypto.randomUUID();
	const offered = new Map<string, { blob: Blob; filename: string }>();
	const timers = new Set<ReturnType<typeof setTimeout>>();
	let closed = false;
	const later = (fn: () => void, ms: number) => {
		const timer = setTimeout(() => {
			timers.delete(timer);
			if (!closed) fn();
		}, ms);
		timers.add(timer);
	};
	channel.onmessage = (event: MessageEvent<FileMessage>) => {
		if (closed) return;
		const message = event.data;
		if (message.kind === "file") {
			offered.set(message.id, {
				blob: new Blob([message.bytes], { type: message.type }),
				filename: message.filename,
			});
			const claim = () => {
				if (closed) return;
				channel.postMessage({
					kind: "claim",
					id: message.id,
					page,
				} satisfies FileMessage);
			};
			if (focused()) claim();
			else later(claim, UNFOCUSED_DELAY_MS);
			// Given to another page, or never claimed: let it go.
			later(() => offered.delete(message.id), CLAIM_TIMEOUT_MS * 2);
		} else if (message.kind === "grant") {
			const file = offered.get(message.id);
			offered.delete(message.id);
			if (file && message.page === page) save(file.blob, file.filename);
		}
	};
	return () => {
		closed = true;
		for (const timer of timers) clearTimeout(timer);
		timers.clear();
		offered.clear();
		channel.close();
	};
};

export const saveFile = (blob: Blob, filename: string): Promise<void> =>
	typeof document === "undefined"
		? handToPage(blob, filename)
		: Promise.resolve(saveInPage(blob, filename));
