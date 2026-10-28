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

// The host is shown unless the link text already is that host, or a URL on
// it. Checking only that the text contains the host would let text such as
// "bank.example/?from=evil.example" hide where the link really goes.
const textNamesHost = (text: string, host: string): boolean => {
	const value = text.trim();
	try {
		const url = new URL(
			/^https?:\/\//i.test(value) ? value : `https://${value}`,
		);
		return url.username === "" && url.password === "" && url.host === host;
	} catch {
		return false;
	}
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
			{host && !textNamesHost(text, host) ? (
				<span className="opacity-70"> ({host})</span>
			) : null}
		</a>
	);
};

export const safeMarkdownComponents: Components = {
	img: SafeMarkdownImage,
	a: SafeMarkdownLink,
};
