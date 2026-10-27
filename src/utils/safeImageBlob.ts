const RENDERABLE_IMAGE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
]);

export const isRenderableImageType = (type: string): boolean =>
	RENDERABLE_IMAGE_TYPES.has(type.toLowerCase());

// Previews and avatars come from the vault or an imported backup, which can
// carry any MIME type. A text/html or SVG blob opened top-level would render
// as a page in the extension origin, so anything that is not a raster image
// becomes opaque bytes: <img> still sniffs and decodes real images, while a
// navigation to it downloads instead of rendering.
export const toSafeImageBlob = (blob: Blob): Blob =>
	isRenderableImageType(blob.type)
		? blob
		: new Blob([blob], { type: "application/octet-stream" });
