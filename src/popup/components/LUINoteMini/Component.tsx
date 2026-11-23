import { LTHEME } from "little-shared/enums";
import type { Note } from "../../../storage/repositories";
import ReactMarkdown from "react-markdown";
import { SafeMarkdownImage, SafeMarkdownLink } from "../../markdownSafety";
import { safeUrlTransform } from "../../markdownUrl";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import {
	getNoteCardTimeLabel,
	getNoteCardTitleAndSnippet,
} from "../../../utils/notePreview";

import { LockIcon } from "@phosphor-icons/react";
import { pressable } from "../../a11y";
import { LUIDeleteButton } from "../LUIDeleteButton/Component";
import { LUITagChips } from "../LUITagChips/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";

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
	activeTag = null,
	onSelectTag,
}: {
	className?: string;
	note: Note;
	onOpen: (note: Note) => void;
	onDelete?: (noteId: string) => Promise<unknown> | void;
	showDelete?: boolean;
	activeTag?: string | null;
	onSelectTag?: (tag: string) => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const lockedTitle = (note.title ?? "").trim() || "Locked note";
	const noteTags = note.tags ?? [];
	const preview = note.locked
		? { title: lockedTitle, snippet: "" }
		: getNoteCardTitleAndSnippet(note.content);
	const previewMarkdown = note.locked
		? ""
		: getCardPreviewMarkdown(note.content);

	return (
		<div
			className={twMerge(
				`flex w-full cursor-pointer flex-col justify-between rounded-2xl border p-3.5 transition-colors active:scale-[0.99] ${
					isDark
						? "border-neutral-800 bg-neutral-900/70 text-neutral-100 hover:border-neutral-700"
						: "border-neutral-200 bg-neutral-100/70 text-neutral-900 hover:border-neutral-300"
				}`,
				className,
			)}
			{...pressable(() => onOpen(note))}
			aria-label={
				note.locked
					? `Open locked note: ${lockedTitle}`
					: `Open note: ${preview.title}`
			}
		>
			<div>
				<div className="flex items-start gap-x-1.5">
					{note.locked ? (
						<LUIThemedIcon
							Icon={LockIcon}
							color="currentColor"
							weight="fill"
							className="mt-0.5 size-4 shrink-0 text-[var(--ll-accent)]"
						/>
					) : null}
					<div className="line-clamp-2 text-sm leading-snug font-semibold">
						{preview.title}
					</div>
				</div>
				{note.locked ? (
					<div
						className={`mt-1.5 text-xs ${
							isDark ? "text-neutral-500" : "text-neutral-500"
						}`}
					>
						Locked · Enter password to view
					</div>
				) : previewMarkdown !== "" ? (
					<div
						className={`mt-1.5 max-h-20 overflow-hidden text-xs leading-relaxed ${
							isDark ? "text-neutral-400" : "text-neutral-600"
						}`}
					>
						<ReactMarkdown
							remarkPlugins={[remarkGfm, remarkBreaks]}
							urlTransform={safeUrlTransform}
							components={{
								img: SafeMarkdownImage,
								a: (props) => (
									<span
										onClick={(event) =>
											event.stopPropagation()
										}
									>
										<SafeMarkdownLink {...props} />
									</span>
								),
								p: ({ ...props }) => (
									<p {...props} className="mb-1" />
								),
								ul: ({ ...props }) => (
									<ul {...props} className="list-disc pl-4" />
								),
								ol: ({ ...props }) => (
									<ol
										{...props}
										className="list-decimal pl-4"
									/>
								),
							}}
						>
							{previewMarkdown}
						</ReactMarkdown>
					</div>
				) : null}
				{noteTags.length > 0 ? (
					<LUITagChips
						tags={noteTags}
						activeTag={activeTag}
						onSelect={onSelectTag}
						className="mt-2"
					/>
				) : null}
			</div>
			<div className="mt-3 flex w-full items-center justify-between gap-x-2">
				<div
					className={`text-xs whitespace-nowrap ${
						isDark ? "text-neutral-400" : "text-neutral-500"
					}`}
				>
					{getNoteCardTimeLabel(note.updatedAt)}
				</div>
				{showDelete && !note.locked ? (
					<div
						className="shrink-0"
						onClick={(event) => event.stopPropagation()}
					>
						<LUIDeleteButton
							subject="note"
							onDelete={() => onDelete?.(note.id)}
							failureMessage="Couldn't delete this note."
						/>
					</div>
				) : null}
			</div>
		</div>
	);
};

export { Component as LUINoteMini };
