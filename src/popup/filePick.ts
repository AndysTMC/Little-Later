// Getting files from the system (a profile photo, backups) is done on one
// shared upload screen, /pick-file, that any screen can send the user to.
//
// It exists because the toolbar popup closes the moment a system file
// window opens, and the chosen file is lost with it. The upload screen
// takes pasted (or dropped) files instead, which needs no such window.
//
// The screen that asks decides what it needs: how many files, of which
// types and sizes, and how to say so. That is its PickRequest. The upload
// screen only enforces it. Accepted files are staged
// (src/storage/staging.ts) and noted in the remembered state (uiState.ts)
// under the asking screen's slot, so the asking screen finds them when
// the user returns, even if the popup closed in between.

export type PickRequest = {
	// The upload screen's heading.
	title: string;
	// What is accepted, in words, shown under the heading.
	accepts: string;
	// Allowed MIME types, or null when the asking screen checks the
	// content itself.
	types: ReadonlyArray<string> | null;
	maxBytes: number;
	// 1 for a single file: a newer file then replaces the last.
	maxFiles: number;
	// What to do, shown in the empty upload area.
	pasteHint: string;
	// Sensitive user content (images, bookmarks HTML): sealed under the
	// unlocked profile's key before touching OPFS and bound to that unlock.
	sensitive?: boolean;
};

// The request arrives in the address, so it is checked like any input.
export const parsePickRequest = (text: string | null): PickRequest | null => {
	if (text === null) {
		return null;
	}
	try {
		const value = JSON.parse(text) as Partial<PickRequest>;
		const isText = (field: unknown): field is string =>
			typeof field === "string" && field !== "" && field.length <= 200;
		if (
			!isText(value.title) ||
			!isText(value.accepts) ||
			!isText(value.pasteHint) ||
			!Number.isSafeInteger(value.maxBytes) ||
			(value.maxBytes as number) <= 0 ||
			!Number.isInteger(value.maxFiles) ||
			(value.maxFiles as number) < 1 ||
			(value.maxFiles as number) > 100 ||
			!(
				value.types === null ||
				(Array.isArray(value.types) && value.types.every(isText))
			) ||
			(value.sensitive !== undefined &&
				typeof value.sensitive !== "boolean")
		) {
			return null;
		}
		return {
			title: value.title,
			accepts: value.accepts,
			types: value.types,
			maxBytes: value.maxBytes as number,
			maxFiles: value.maxFiles as number,
			pasteHint: value.pasteHint,
			...(value.sensitive ? { sensitive: true } : {}),
		};
	} catch {
		return null;
	}
};

// What is remembered about an uploaded file: the staged file's name and
// what is needed to show and use it.
export type PickedFile = {
	file: string;
	type: string;
	name: string;
	size: number;
	encrypted?: boolean;
	profileId?: string;
	unlockId?: string;
};

export const isPickedFile = (value: unknown): value is PickedFile =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as PickedFile).file === "string" &&
	typeof (value as PickedFile).type === "string" &&
	typeof (value as PickedFile).name === "string" &&
	((value as PickedFile).encrypted === undefined ||
		typeof (value as PickedFile).encrypted === "boolean") &&
	((value as PickedFile).profileId === undefined ||
		typeof (value as PickedFile).profileId === "string") &&
	((value as PickedFile).unlockId === undefined ||
		typeof (value as PickedFile).unlockId === "string");

// The files handed to the asking screen.
export const pickKey = (slot: string): string => `pick.${slot}`;
// The files pasted so far, before Upload is pressed.
export const pendingPickKey = (slot: string): string => `pick.pending.${slot}`;

export const asPickedFiles = (value: unknown): Array<PickedFile> =>
	(Array.isArray(value) ? value : [value]).filter(isPickedFile);

// Staged files the remembered state still holds: pasted on the upload
// screen, or uploaded and waiting for the asking screen to use them. The
// worker's sweep of leftover staged files keeps these (staging.ts).
export const stagedFilesInUse = (
	drafts: Record<string, unknown>,
): Set<string> =>
	new Set(
		Object.entries(drafts)
			.filter(([key]) => key.startsWith(pickKey("")))
			.flatMap(([, value]) =>
				asPickedFiles(value).map((file) => file.file),
			),
	);

// The route that asks for files. `slot` names where the asking screen
// will look for them; `returnTo` is the route to go back to.
export const pickRoute = (
	request: PickRequest,
	slot: string,
	returnTo: string,
): string =>
	`/pick-file?${new URLSearchParams({
		request: JSON.stringify(request),
		slot,
		returnTo,
	}).toString()}`;

// Why a file cannot be used for a request, or null if it can.
export const pickProblem = (
	request: PickRequest,
	file: { type: string; size: number },
): string | null => {
	if (file.size === 0) {
		return "That file is empty.";
	}
	if (request.types && !request.types.includes(file.type)) {
		return `That is not a file this accepts. ${request.accepts}.`;
	}
	if (file.size > request.maxBytes) {
		return `That file is too large. ${request.accepts}.`;
	}
	return null;
};
