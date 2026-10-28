import type { Save } from "../../../storage/repositories";
import { searchSaves } from "../../../popup/records";
import { readPreview, readSaves, unlockedKeys } from "../records";
import {
	isRenderableImageType,
	toSafeImageBlob,
} from "../../../utils/safeImageBlob";

const blobToDataUrl = async (blob: Blob): Promise<string> => {
	if (typeof FileReader !== "undefined") {
		try {
			return await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => {
					const result = reader.result;
					if (typeof result === "string") {
						resolve(result);
						return;
					}
					reject(new Error("Could not convert preview image."));
				};
				reader.onerror = () =>
					reject(new Error("Could not convert preview image."));
				reader.readAsDataURL(blob);
			});
		} catch {
			// Continue with byte fallback.
		}
	}
	if (typeof (blob as { arrayBuffer?: unknown }).arrayBuffer === "function") {
		const bytes = new Uint8Array(await (blob as Blob).arrayBuffer());
		let binary = "";
		for (const byte of bytes) {
			binary += String.fromCharCode(byte);
		}
		const base64 = btoa(binary);
		return `data:${isRenderableImageType(blob.type) ? blob.type : "image/png"};base64,${base64}`;
	}
	throw new Error("Could not convert preview image.");
};

const toRenderableImageUrl = async (preview: Blob): Promise<string> => {
	const blob = toSafeImageBlob(preview);
	if (
		typeof URL !== "undefined" &&
		typeof URL.createObjectURL === "function"
	) {
		try {
			return URL.createObjectURL(blob);
		} catch {
			// Fallback to data URL below.
		}
	}
	return blobToDataUrl(blob);
};

const resolveSave = async (
	saves: Array<Save>,
	{
		id,
		query,
		url,
	}: {
		id?: string;
		url?: string;
		query?: string;
	},
): Promise<Save> => {
	if (id !== undefined) {
		const saveById = saves.find((save) => save.id === id);
		if (!saveById) {
			throw new Error(`Save ${id} was not found.`);
		}
		return saveById;
	}

	if (url) {
		const saveByUrl = saves.find((save) => save.url === url);
		if (!saveByUrl) {
			throw new Error("No save matched the provided URL.");
		}
		return saveByUrl;
	}

	if (query) {
		const matches = searchSaves(saves, query);
		if (matches.length === 0) {
			throw new Error("No save matched the query.");
		}
		return matches[0];
	}

	throw new Error("Provide id, url, or query to fetch a preview image.");
};

const toolCall = async ({
	id,
	query,
	url,
}: {
	id?: string;
	url?: string;
	query?: string;
}): Promise<{
	save: Save;
	previewUrl: string;
}> => {
	const keys = await unlockedKeys();
	const save = await resolveSave(await readSaves(keys), { id, query, url });
	const previewBlob = await readPreview(keys, save.id);
	if (!previewBlob) {
		throw new Error("No preview image is available for that save.");
	}
	return {
		save,
		previewUrl: await toRenderableImageUrl(previewBlob),
	};
};

export { toolCall as getSavePreviewImageToolCall };
