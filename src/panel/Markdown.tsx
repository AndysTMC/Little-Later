import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { SafeMarkdownImage, SafeMarkdownLink } from "../popup/markdownSafety";
import { safeUrlTransform } from "../popup/markdownUrl";
import { useTheme } from "../popup/hooks/useTheme";

// A code block, with a button that copies what it holds.
const CodeBlock = ({ children }: { children?: React.ReactNode }) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const pre = useRef<HTMLPreElement>(null);
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (timer.current) clearTimeout(timer.current);
		},
		[],
	);
	return (
		<div className="group relative">
			<pre ref={pre} className={`${theme}-thin-scrollbar`}>
				{children}
			</pre>
			<button
				type="button"
				aria-label={copied ? "Copied" : "Copy code"}
				title="Copy code"
				onClick={() => {
					void navigator.clipboard
						.writeText(pre.current?.innerText ?? "")
						.then(() => {
							setCopied(true);
							if (timer.current) clearTimeout(timer.current);
							timer.current = setTimeout(
								() => setCopied(false),
								2_000,
							);
						})
						.catch(() => undefined);
				}}
				className={`absolute top-1.5 right-1.5 flex size-7 cursor-pointer items-center justify-center rounded-lg border opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 ${dark ? "border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100"}`}
			>
				{copied ? (
					<CheckIcon weight="bold" className="size-3.5" />
				) : (
					<CopyIcon weight="bold" className="size-3.5" />
				)}
			</button>
		</div>
	);
};

// Wide markdown tables scroll cleanly inside their own container instead of
// clipping or forcing a horizontal scrollbar onto the whole chat log.
const ScrollableTable = ({ children }: { children?: React.ReactNode }) => {
	const { theme } = useTheme();
	return (
		<div
			className={`my-2 w-full max-w-full overflow-x-auto ${theme}-thin-scrollbar`}
		>
			<table>{children}</table>
		</div>
	);
};

const components: Components = {
	img: SafeMarkdownImage,
	a: SafeMarkdownLink,
	pre: CodeBlock,
	table: ScrollableTable,
};

// LittleAI's markdown: the app's safe links and images, scrollable tables,
// and code blocks that copy.
export const Markdown = ({ text }: { text: string }) => (
	<div className="ll-markdown max-w-full min-w-0">
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			urlTransform={safeUrlTransform}
			components={components}
		>
			{text}
		</ReactMarkdown>
	</div>
);
