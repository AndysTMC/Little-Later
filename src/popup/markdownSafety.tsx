import type { ComponentPropsWithoutRef } from "react";
import { defaultUrlTransform, type Components } from "react-markdown";

const RASTER_DATA_IMAGE = /^data:image\/(png|jpeg|webp|gif)[;,]/i;
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

const hostOf = (href: string): string | null => {
	try {
		const url = new URL(href);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.host
			: null;
	} catch {
		return null;
	}
};

export const SafeMarkdownImage = ({
	src,
	alt,
	className,
}: ComponentPropsWithoutRef<"img">) => {
	const source = typeof src === "string" ? src : "";
	if (isInlineImageAllowed(source)) {
		return <img src={source} alt={alt ?? ""} className={className} />;
	}
	const host = hostOf(source);
	const label = `Image${alt ? `: ${alt}` : ""}${host ? ` (${host})` : ""}`;
	return host ? (
		<a
			href={source}
			target="_blank"
			rel="noopener noreferrer"
			className="underline"
		>
			{label}
		</a>
	) : (
		<span>{label}</span>
	);
};

export const SafeMarkdownLink = ({
	href,
	children,
}: ComponentPropsWithoutRef<"a">) => {
	const host = href ? hostOf(href) : null;
	const text = typeof children === "string" ? children : "";
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="underline"
		>
			{children}
			{host && !text.includes(host) ? (
				<span className="opacity-70"> ({host})</span>
			) : null}
		</a>
	);
};

export const safeMarkdownComponents: Components = {
	img: SafeMarkdownImage,
	a: SafeMarkdownLink,
};
