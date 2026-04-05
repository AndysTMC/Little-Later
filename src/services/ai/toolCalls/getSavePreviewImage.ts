import { LVisualBM } from "little-shared/types";
import {
	getVisualBM,
	getVisualBMByUrl,
	getVisualBMPreview,
	getVisualBMs,
} from "../../../services/visualBM";
import { searchSavesByText } from "../../../utils/visualBM";

const toUint8Array = async (value: unknown): Promise<Uint8Array> => {
	if (value instanceof Uint8Array) {
		return value;
	}
	if (value instanceof ArrayBuffer) {
		return new Uint8Array(value);
	}
	if (value && typeof value === "object") {
		const record = value as {
			data?: unknown;
			buffer?: unknown;
			arrayBuffer?: () => Promise<ArrayBuffer>;
		};
		if (typeof record.arrayBuffer === "function") {
			return new Uint8Array(await record.arrayBuffer());
		}
		if (record.data instanceof Uint8Array) {
			return record.data;
		}
		if (record.data instanceof ArrayBuffer) {
			return new Uint8Array(record.data);
		}
		if (Array.isArray(record.data)) {
			return Uint8Array.from(
				record.data.filter(
					(item): item is number =>
						typeof item === "number" && Number.isFinite(item),
				),
			);
		}
		if (record.buffer instanceof ArrayBuffer) {
			return new Uint8Array(record.buffer);
		}
	}
	throw new Error("Could not read preview image bytes.");
};

const normalizeToBlob = async (value: unknown): Promise<Blob> => {
	if (value instanceof Blob) {
		return value;
	}
	const type =
		value &&
		typeof value === "object" &&
		"type" in value &&
		typeof value.type === "string" &&
		value.type !== ""
			? value.type
			: "image/png";
	const bytes = await toUint8Array(value);
	return new Blob([bytes.buffer as ArrayBuffer], { type });
};

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
		return `data:${blob.type || "image/png"};base64,${base64}`;
	}
	throw new Error("Could not convert preview image.");
};

const toRenderableImageUrl = async (value: unknown): Promise<string> => {
	const blob = await normalizeToBlob(value);
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

const resolveSave = async ({
	id,
	query,
	url,
}: {
	id?: number;
	url?: string;
	query?: string;
}): Promise<LVisualBM> => {
	if (id !== undefined) {
		const saveById = await getVisualBM(id);
		if (!saveById) {
			throw new Error(`Save ${id} was not found.`);
		}
		return saveById;
	}

	if (url) {
		const saveByUrl = await getVisualBMByUrl(url);
		if (!saveByUrl) {
			throw new Error("No save matched the provided URL.");
		}
		return saveByUrl;
	}

	if (query) {
		const allSaves = await getVisualBMs();
		const matches = searchSavesByText(allSaves, query).filter(
			(save) => save.isSaved === 1,
		);
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
	id?: number;
	url?: string;
	query?: string;
}): Promise<{
	save: LVisualBM;
	previewUrl: string;
}> => {
	const save = await resolveSave({ id, query, url });
	const previewBlob = await getVisualBMPreview(save.id);
	if (!previewBlob) {
		throw new Error("No preview image is available for that save.");
	}
	return {
		save,
		previewUrl: await toRenderableImageUrl(previewBlob),
	};
};

export { toolCall as getSavePreviewImageToolCall };
