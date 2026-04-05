import { LTHEME } from "little-shared/enums";
import { LNote } from "little-shared/types";
import { TrashIcon } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import {
	getNoteCardTimeLabel,
	getNoteCardTitleAndSnippet,
} from "../../../utils/notePreview";

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
	if (remainder !== "") {
		return remainder;
	}
	return lines[firstNonEmptyLine];
};

const Component = ({
	className,
	note,
	onOpen,
	onDelete,
	showDelete = true,
}: {
	className?: string;
	note: LNote;
	onOpen: (note: LNote) => void;
	onDelete?: (noteId: number) => Promise<void> | void;
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
			onClick={() => onOpen(note)}
		>
			<div className="text-lg leading-tight font-extrabold">
				{preview.title}
			</div>
			<div
				className={`mt-2 max-h-28 overflow-hidden text-sm leading-relaxed ${
					theme === LTHEME.DARK
						? "text-neutral-300"
						: "text-neutral-700"
				}`}
			>
				<ReactMarkdown
					remarkPlugins={[remarkGfm, remarkBreaks]}
					rehypePlugins={[rehypeRaw]}
					components={{
						p: ({ ...props }) => <p {...props} className="mb-1" />,
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
			<div className="mt-4 flex w-full items-center justify-between">
				<div
					className={`text-sm ${
						theme === LTHEME.DARK
							? "text-neutral-400"
							: "text-neutral-600"
					}`}
				>
					{getNoteCardTimeLabel(note.lastModificationDate)}
				</div>
				{showDelete ? (
					<button
						type="button"
						className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-all active:scale-95 ${
							theme === LTHEME.DARK
								? "hover:bg-neutral-700"
								: "hover:bg-neutral-300"
						}`}
						onClick={async (event) => {
							event.stopPropagation();
							await onDelete?.(note.id);
						}}
					>
						<LUIThemedIcon
							Icon={TrashIcon}
							color={theme === LTHEME.DARK ? "white" : "black"}
							weight="bold"
							className="size-4"
						/>
					</button>
				) : null}
			</div>
		</div>
	);
};

export { Component as LUINoteMini };
