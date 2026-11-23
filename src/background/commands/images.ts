import { sealAsset, sealBody, type ProfileKeys } from "../../storage/keys";
import {
	IMAGE_KIND,
	openImage,
	type ImageContent,
} from "../../storage/repositories";
import type { ImageRow, LittleDB } from "../../storage/schema";
import { fromBase64 } from "../../storage/session";
import { cascadeTables, removeRecords } from "./cascade";
import { optionalTags } from "./records";
import {
	CommandError,
	asRecord,
	asString,
	defineCommand,
	fail,
} from "./registry";
import { asWebUrl } from "./saves";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/avif",
]);

const MAX_IMAGE_TITLE_LENGTH = 120;

const asMimeType = (value: unknown): string => {
	const raw = asString(value, "mimeType").trim().toLowerCase().split(";")[0];
	const normalized = raw === "image/jpg" ? "image/jpeg" : raw;
	return ALLOWED_IMAGE_MIME_TYPES.has(normalized)
		? normalized
		: fail("Unsupported image type. Use PNG, JPEG, WebP, GIF, or AVIF.");
};

const optionalTitle = (value: unknown): string | undefined => {
	if (value === undefined) return undefined;
	return asString(value, "title").trim().slice(0, MAX_IMAGE_TITLE_LENGTH);
};

const optionalSourceUrl = (value: unknown): string | undefined => {
	if (value === undefined) return undefined;
	if (typeof value === "string" && value.trim() === "") return undefined;
	return asWebUrl(value);
};

// Base64 expands bytes by 4/3 (plus padding), so reject obviously oversized
// payloads before allocating the decoded Uint8Array.
const MAX_BASE64_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8;

const asImageBytes = (value: unknown): Uint8Array => {
	const base64 = asString(value, "bytesBase64");
	if (base64.length > MAX_BASE64_LENGTH) {
		return fail("Image exceeds the 10 MB limit.");
	}
	let bytes: Uint8Array;
	try {
		bytes = fromBase64(base64);
	} catch {
		return fail("Image data is not valid base64.");
	}
	if (bytes.byteLength === 0) {
		return fail("Image cannot be empty.");
	}
	if (bytes.byteLength > MAX_IMAGE_BYTES) {
		return fail("Image exceeds the 10 MB limit.");
	}
	return bytes;
};

const getOwnImage = async (
	db: LittleDB,
	keys: ProfileKeys,
	id: string,
): Promise<ImageRow> => {
	const row = await db.images.get(id);
	if (!row || row.profileId !== keys.profileId) {
		throw new CommandError("rejected", "Image not found.");
	}
	return row;
};

export const imageCreate = defineCommand({
	name: "image.create",
	parse: (input) => {
		const record = asRecord(input);
		return {
			bytesBase64: asString(record.bytesBase64, "bytesBase64"),
			mimeType: asMimeType(record.mimeType),
			title: optionalTitle(record.title),
			sourceUrl: optionalSourceUrl(record.sourceUrl),
			tags: optionalTags(record.tags),
		};
	},
	run: async (ctx, input) => {
		const bytes = asImageBytes(input.bytesBase64);
		const keys = await ctx.keys();
		const id = crypto.randomUUID();
		const assetId = crypto.randomUUID();
		const now = ctx.now();
		const tags = input.tags ?? [];
		const title = input.title || "Saved image";
		const sealed = await sealBody<ImageContent>(keys, "images", id, {
			title,
			mimeType: input.mimeType,
			...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
			...(tags.length > 0 ? { tags } : {}),
		});
		const sealedAsset = await sealAsset(keys, assetId, bytes);
		await ctx.db.transaction(
			"rw",
			[ctx.db.images, ctx.db.assets],
			async () => {
				await ctx.db.images.add({
					id,
					profileId: keys.profileId,
					...sealed,
					createdAt: now,
					updatedAt: now,
					privacy: "private",
				});
				await ctx.db.assets.add({
					id: assetId,
					profileId: keys.profileId,
					...sealedAsset,
					createdAt: now,
					updatedAt: now,
					ownerId: id,
					kind: IMAGE_KIND,
				});
			},
		);
		return { id };
	},
});

export const imageUpdate = defineCommand({
	name: "image.update",
	parse: (input) => {
		const record = asRecord(input);
		return {
			id: asString(record.id, "id"),
			title: optionalTitle(record.title),
			tags: optionalTags(record.tags),
		};
	},
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await getOwnImage(ctx.db, keys, input.id);
		const existing = await openImage(keys, row);
		const title =
			input.title !== undefined
				? input.title || "Saved image"
				: existing.title;
		const tags = input.tags ?? existing.tags ?? [];
		const sealed = await sealBody<ImageContent>(keys, "images", row.id, {
			title,
			mimeType: existing.mimeType,
			...(existing.sourceUrl ? { sourceUrl: existing.sourceUrl } : {}),
			...(tags.length > 0 ? { tags } : {}),
		});
		await ctx.db.images.put({ ...row, ...sealed, updatedAt: ctx.now() });
		return null;
	},
});

export const imageDelete = defineCommand({
	name: "image.delete",
	parse: (input) => ({ id: asString(asRecord(input).id, "id") }),
	run: async (ctx, input) => {
		const keys = await ctx.keys();
		const row = await ctx.db.images.get(input.id);
		if (!row || row.profileId !== keys.profileId) {
			return null;
		}
		await ctx.db.transaction("rw", cascadeTables(ctx.db), () =>
			removeRecords(ctx.db, keys.profileId, [row.id]),
		);
		return null;
	},
});
