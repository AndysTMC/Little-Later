import { defaultUrlTransform } from "react-markdown";

const RASTER_DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif|avif)[;,]/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const currentOrigin = (): string =>
	typeof location === "undefined" ? "" : location.origin;

// Markdown here can come from the AI, a note, or a backup. Loading a remote
// image needs no click, so it can carry data out in its URL. Only images that
// already live inside the extension render inline: relative paths, this
// page's own URLs and blob: URLs, and raster data: URLs.
export const isInlineImageAllowed = (
	src: string,
	origin: string = currentOrigin(),
): boolean => {
	const value = src.trim();
	if (value === "") {
		return false;
	}
	if (RASTER_DATA_IMAGE.test(value)) {
		return true;
	}
	if (value.startsWith("//")) {
		return false;
	}
	if (!HAS_SCHEME.test(value)) {
		return true;
	}
	return (
		origin !== "" &&
		(value.startsWith(`${origin}/`) || value.startsWith(`blob:${origin}/`))
	);
};

export const safeUrlTransform = (url: string, key: string): string =>
	key === "src" && isInlineImageAllowed(url) ? url : defaultUrlTransform(url);
