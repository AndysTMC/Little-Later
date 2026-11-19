import { LTHEME } from "little-shared/enums";
import type { Note } from "../../../storage/repositories";
import ReactMarkdown from "react-markdown";
import { safeMarkdownComponents, safeUrlTransform } from "../../markdownSafety";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import {
	getNoteCardTimeLabel,
	getNoteCardTitleAndSnippet,
} from "../../../utils/notePreview";

import { pressable } from "../../a11y";
import { LUIDeleteButton } from "../LUIDeleteButton/Component";

// What shows under the title: the lines after it. A one-line note is all
// title, so it has none, rather than showing the same line twice.
const getCardPreviewMarkdown = (content: string): string => {
	const lines = content.split(/\r?\n/);
	const firstNonEmptyLine = lines.findIndex((line) => line.trim() !== "");
	if (firstNonEmptyLine === -1) {
		return "Tap to add details.";
	}
	const remainder = lines
		.slice(firstNonEmptyLine + 1)
		.join("\n")
		.trim();
	return remainder;
};

const Component = ({
	className,
	note,
	onOpen,
	onDelete,
	showDelete = true,
}: {
	className?: string;
	note: Note;
	onOpen: (note: Note) => void;
	onDelete?: (noteId: string) => Promise<unknown> | void;
	showDelete?: boolean;
}) => {
	const { theme } = useTheme();
	const preview = getNoteCardTitleAndSnippet(note.content);
	const previewMarkdown = getCardPreviewMarkdown(note.content);

	return (
		<div
			className={twMerge(
				`mb-3 w-full cursor-pointer break-inside-avoid rounded-3xl border p-4 transition-all active:scale-[0.99] ${
					theme === LTHEME.DARK
						? "border-neutral-800 bg-neutral-900 text-white hover:bg-neutral-800"
						: "border-neutral-200 bg-neutral-100 text-black hover:bg-neutral-200"
				}`,
				className,
			)}
			{...pressable(() => onOpen(note))}
			aria-label={`Open note: ${preview.title}`}
		>
			<div className="text-lg leading-tight font-extrabold">
				{preview.title}
			</div>
			{previewMarkdown !== "" ? (
				<div
					className={`mt-2 max-h-28 overflow-hidden text-sm leading-relaxed ${
						theme === LTHEME.DARK
							? "text-neutral-300"
							: "text-neutral-700"
					}`}
				>
					<ReactMarkdown
						remarkPlugins={[remarkGfm, remarkBreaks]}
						urlTransform={safeUrlTransform}
						components={{
							...safeMarkdownComponents,
							p: ({ ...props }) => (
								<p {...props} className="mb-1" />
							),
							ul: ({ ...props }) => (
								<ul {...props} className="list-disc pl-4" />
							),
							ol: ({ ...props }) => (
								<ol {...props} className="list-decimal pl-4" />
							),
						}}
					>
						{previewMarkdown}
					</ReactMarkdown>
				</div>
			) : null}
			<div className="mt-4 flex w-full items-center justify-between">
				<div
					className={`text-sm ${
						theme === LTHEME.DARK
							? "text-neutral-400"
							: "text-neutral-600"
					}`}
				>
					{getNoteCardTimeLabel(note.updatedAt)}
				</div>
				{showDelete ? (
					<LUIDeleteButton
						subject="note"
						onDelete={() => onDelete?.(note.id)}
						failureMessage="Couldn't delete this note."
					/>
				) : null}
			</div>
		</div>
	);
};

export { Component as LUINoteMini };
