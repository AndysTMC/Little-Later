import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { LNote } from "little-shared/types";
import { LDateUtl } from "little-shared/utils/datetime";
import { fakeWait } from "little-shared/utils/misc";
import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { updateNote } from "../../../services/note";
import { LUIFeaturePageUD } from "../LUIFeaturePageUD/Component";
import { LUICUButton } from "../LUICUButton/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import {
	ArrowCounterClockwiseIcon,
	ArrowClockwiseIcon,
	NotebookIcon,
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import {
	applyNoteFormatting,
	NoteFormattingAction,
	NoteFormattingResult,
} from "../../../utils/noteFormatting";

type ToolbarAction = {
	id: NoteFormattingAction;
	label: string;
};

const TOOLBAR_ACTIONS: Array<ToolbarAction> = [
	{ id: "bold", label: "B" },
	{ id: "italic", label: "I" },
	{ id: "underline", label: "U" },
	{ id: "strikethrough", label: "S" },
	{ id: "h1", label: "H1" },
	{ id: "h2", label: "H2" },
	{ id: "bullet", label: "• List" },
	{ id: "numbered", label: "1. List" },
	{ id: "checklist", label: "Checklist" },
	{ id: "quote", label: "Quote" },
	{ id: "inlineCode", label: "`Code`" },
	{ id: "codeBlock", label: "{ }" },
	{ id: "link", label: "Link" },
];

const Component = ({
	className,
	note,
}: {
	className?: string;
	note: LNote;
}) => {
	const { theme } = useTheme();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const historyRef = useRef<Array<string>>([note.content]);
	const historyIndexRef = useRef(0);

	const [draftContent, setDraftContent] = useState(note.content);
	const [baselineContent, setBaselineContent] = useState(note.content);
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);
	const [viewMode, setViewMode] = useState<"edit" | "preview">("preview");
	const [isSaving, setIsSaving] = useState(false);

	const syncHistoryFlags = () => {
		setCanUndo(historyIndexRef.current > 0);
		setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
	};

	const resetHistory = (content: string) => {
		historyRef.current = [content];
		historyIndexRef.current = 0;
		syncHistoryFlags();
	};

	const pushHistory = (content: string) => {
		const current = historyRef.current[historyIndexRef.current];
		if (current === content) {
			return;
		}
		const nextHistory = historyRef.current.slice(
			0,
			historyIndexRef.current + 1,
		);
		nextHistory.push(content);
		if (nextHistory.length > 200) {
			nextHistory.shift();
			historyIndexRef.current = nextHistory.length - 1;
		} else {
			historyIndexRef.current = nextHistory.length - 1;
		}
		historyRef.current = nextHistory;
		syncHistoryFlags();
	};

	useEffect(() => {
		setDraftContent(note.content);
		setBaselineContent(note.content);
		setViewMode("preview");
		resetHistory(note.content);
	}, [note.id, note.content]);

	const applyFormattingResult = (result: NoteFormattingResult) => {
		setDraftContent(result.content);
		pushHistory(result.content);
		requestAnimationFrame(() => {
			if (!textareaRef.current) {
				return;
			}
			textareaRef.current.focus();
			textareaRef.current.setSelectionRange(
				result.selection.start,
				result.selection.end,
			);
		});
	};

	const handleApplyFormatting = (action: NoteFormattingAction) => {
		if (!textareaRef.current) {
			return;
		}
		const result = applyNoteFormatting(
			draftContent,
			{
				start: textareaRef.current.selectionStart,
				end: textareaRef.current.selectionEnd,
			},
			action,
		);
		applyFormattingResult(result);
	};

	const handleUndo = () => {
		if (!canUndo) {
			return;
		}
		historyIndexRef.current -= 1;
		setDraftContent(historyRef.current[historyIndexRef.current]);
		syncHistoryFlags();
	};

	const handleRedo = () => {
		if (!canRedo) {
			return;
		}
		historyIndexRef.current += 1;
		setDraftContent(historyRef.current[historyIndexRef.current]);
		syncHistoryFlags();
	};

	const handleDraftChange = (nextContent: string) => {
		setDraftContent(nextContent);
		pushHistory(nextContent);
	};

	const handleSave = async () => {
		if (isSaving || draftContent === baselineContent) {
			return;
		}
		setIsSaving(true);
		try {
			await Promise.all([
				updateNote(note.id, {
					content: draftContent,
					lastModificationDate: LDateUtl.getNow(),
				}),
				fakeWait({ waitPeriod: 1200 }),
			]);
			setIsSaving(false);
			setBaselineContent(draftContent);
			resetHistory(draftContent);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div
			className={twMerge(
				`flex min-h-0 w-full grow flex-col overflow-y-auto`,
				className,
			)}
		>
			<LUIFeaturePageUD Icon={NotebookIcon} />
			<div
				className={`flex min-h-0 w-full grow flex-col overflow-y-auto ${theme}-scrollbar `}
			>
				<div className="flex w-full items-center justify-between px-4 py-1">
					<div className="flex items-center gap-x-3">
						<button
							type="button"
							onClick={() => setViewMode("preview")}
							className={`h-7 cursor-pointer text-xs font-bold transition-opacity active:scale-95 ${
								viewMode === "preview"
									? "underline underline-offset-4 opacity-100"
									: "opacity-55 hover:opacity-85"
							} ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
						>
							Preview
						</button>
						<button
							type="button"
							onClick={() => setViewMode("edit")}
							className={`h-7 cursor-pointer text-xs font-bold transition-opacity active:scale-95 ${
								viewMode === "edit"
									? "underline underline-offset-4 opacity-100"
									: "opacity-55 hover:opacity-85"
							} ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
						>
							Edit
						</button>
					</div>
					{viewMode === "edit" ? (
						<div className="flex items-center gap-x-3">
							<button
								type="button"
								className={`flex h-7 items-center gap-x-1 text-xs font-bold transition-opacity active:scale-95 ${
									canUndo
										? "cursor-pointer opacity-85 hover:opacity-100"
										: "cursor-not-allowed opacity-35"
								} ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
								onMouseDown={(event) => event.preventDefault()}
								onClick={handleUndo}
								disabled={!canUndo}
							>
								<LUIThemedIcon
									Icon={ArrowCounterClockwiseIcon}
									weight="bold"
									className="size-4"
								/>
								Undo
							</button>
							<button
								type="button"
								className={`flex h-7 items-center gap-x-1 text-xs font-bold transition-opacity active:scale-95 ${
									canRedo
										? "cursor-pointer opacity-85 hover:opacity-100"
										: "cursor-not-allowed opacity-35"
								} ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
								onMouseDown={(event) => event.preventDefault()}
								onClick={handleRedo}
								disabled={!canRedo}
							>
								<LUIThemedIcon
									Icon={ArrowClockwiseIcon}
									weight="bold"
									className="size-4"
								/>
								Redo
							</button>
						</div>
					) : null}
				</div>

				{viewMode === "edit" ? (
					<div className={`flex grow flex-col px-4 py-2`}>
						<div
							className={`mb-2 flex w-full flex-wrap gap-2 rounded-xl border p-2 ${
								theme === LTHEME.DARK
									? "border-neutral-700 bg-neutral-900"
									: "border-neutral-300 bg-neutral-100"
							}`}
						>
							{TOOLBAR_ACTIONS.map((action) => (
								<button
									key={action.id}
									type="button"
									className={`h-8 cursor-pointer rounded-md px-2 text-xs font-bold transition-all active:scale-95 ${
										theme === LTHEME.DARK
											? "bg-black text-white hover:bg-neutral-800"
											: "bg-white text-black hover:bg-neutral-200"
									}`}
									onMouseDown={(event) =>
										event.preventDefault()
									}
									onClick={() =>
										handleApplyFormatting(action.id)
									}
								>
									{action.label}
								</button>
							))}
						</div>

						<textarea
							ref={textareaRef}
							className={`w-full grow resize-none overflow-y-auto p-2 text-sm outline-none ${theme}-thin-scrollbar ${
								theme === LTHEME.DARK
									? "bg-neutral-900 text-white"
									: "bg-neutral-100 text-black"
							}`}
							value={draftContent}
							onChange={(event) =>
								handleDraftChange(event.target.value)
							}
							onInput={(event) =>
								handleDraftChange(
									(event.target as HTMLTextAreaElement).value,
								)
							}
							onKeyDown={(event) => {
								const withModifier =
									event.ctrlKey || event.metaKey;
								if (!withModifier) {
									return;
								}

								const key = event.key.toLowerCase();
								if (key === "b") {
									event.preventDefault();
									handleApplyFormatting("bold");
								}
								if (key === "i") {
									event.preventDefault();
									handleApplyFormatting("italic");
								}
								if (key === "u") {
									event.preventDefault();
									handleApplyFormatting("underline");
								}
								if (event.shiftKey && key === "x") {
									event.preventDefault();
									handleApplyFormatting("strikethrough");
								}
								if (event.shiftKey && key === "1") {
									event.preventDefault();
									handleApplyFormatting("h1");
								}
								if (event.shiftKey && key === "2") {
									event.preventDefault();
									handleApplyFormatting("h2");
								}
								if (event.shiftKey && key === "8") {
									event.preventDefault();
									handleApplyFormatting("bullet");
								}
								if (event.shiftKey && key === "7") {
									event.preventDefault();
									handleApplyFormatting("numbered");
								}
								if (event.shiftKey && key === "9") {
									event.preventDefault();
									handleApplyFormatting("checklist");
								}
								if (event.shiftKey && key === ".") {
									event.preventDefault();
									handleApplyFormatting("quote");
								}
								if (key === "e") {
									event.preventDefault();
									handleApplyFormatting("inlineCode");
								}
								if (event.shiftKey && key === "c") {
									event.preventDefault();
									handleApplyFormatting("codeBlock");
								}
								if (key === "k") {
									event.preventDefault();
									handleApplyFormatting("link");
								}
								if (key === "z" && !event.shiftKey) {
									event.preventDefault();
									handleUndo();
								}
								if (
									key === "y" ||
									(key === "z" && event.shiftKey)
								) {
									event.preventDefault();
									handleRedo();
								}
							}}
						/>
					</div>
				) : (
					<div
						className={`w-full grow overflow-y-auto px-4 py-2 text-sm ${theme}-thin-scrollbar ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
					>
						<ReactMarkdown
							remarkPlugins={[remarkGfm, remarkBreaks]}
							rehypePlugins={[rehypeRaw]}
							components={{
								a: ({ ...props }) => (
									<a
										{...props}
										target="_blank"
										rel="noreferrer"
										className="underline"
									/>
								),
								h1: ({ ...props }) => (
									<h1
										{...props}
										className="mb-2 text-2xl font-black"
									/>
								),
								h2: ({ ...props }) => (
									<h2
										{...props}
										className="mb-2 text-xl font-extrabold"
									/>
								),
								ul: ({ ...props }) => (
									<ul
										{...props}
										className="my-2 list-disc pl-5"
									/>
								),
								ol: ({ ...props }) => (
									<ol
										{...props}
										className="my-2 list-decimal pl-5"
									/>
								),
								blockquote: ({ ...props }) => (
									<blockquote
										{...props}
										className={`my-2 border-l-2 pl-3 italic ${
											theme === LTHEME.DARK
												? "border-neutral-400"
												: "border-neutral-600"
										}`}
									/>
								),
								code: ({ ...props }) => (
									<code
										{...props}
										className={`rounded px-1 ${
											theme === LTHEME.DARK
												? "bg-neutral-900"
												: "bg-neutral-200"
										}`}
									/>
								),
							}}
						>
							{draftContent.length === 0
								? "_Empty note_"
								: draftContent}
						</ReactMarkdown>
					</div>
				)}
			</div>
			{viewMode === "edit" ? (
				<div className="flex h-16 w-full items-center justify-center px-4 pt-1 pb-2">
					<LUICUButton
						name={isSaving ? "Updating..." : "Update"}
						onClick={handleSave}
						passedTheme={theme}
						disabled={isSaving || draftContent === baselineContent}
					/>
				</div>
			) : null}
		</div>
	);
};

export { Component as LUINoteDetailForm };
