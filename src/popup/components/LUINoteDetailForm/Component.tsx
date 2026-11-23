import {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { twMerge } from "tailwind-merge";
import { useNavigate } from "react-router";
import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { send } from "../../../utils/send";
import { sameTags } from "../../../utils/tags";
import { LUIFeaturePageUD } from "../LUIFeaturePageUD/Component";
import { LUICUButton } from "../LUICUButton/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import {
	ArrowCounterClockwiseIcon,
	ArrowClockwiseIcon,
	LockIcon,
	LockOpenIcon,
	NotebookIcon,
} from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import { SafeMarkdownImage, SafeMarkdownLink } from "../../markdownSafety";
import { safeUrlTransform } from "../../markdownUrl";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
	applyNoteFormatting,
	NoteFormattingAction,
	NoteFormattingResult,
} from "../../../utils/noteFormatting";

import { LTOAST_TYPE } from "little-shared/enums";
import { createToast } from "../../../services/toasts";

import { UIStateContext } from "../../contexts/UIStateContext";

import type { Save } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { linkedFrom } from "../../records";
import { LUIVBMLinks } from "../LUIVBMLinks/Component";
import { LUITagInput } from "../LUITagInput/Component";
import { LUITagChips } from "../LUITagChips/Component";
import { LUINote } from "../LUINote/Component";
import { LUIPillButton } from "../LUIPillButton/Component";

// One array each, so a caller that passes none does not look like a
// change on every render.
const NO_LINKS: Array<LinkRow> = [];
const NO_SAVES: Array<Save> = [];
const NO_TAGS: Array<string> = [];

type ToolbarAction = {
	id: NoteFormattingAction;
	label: string;
	title: string;
};

const TOOLBAR_ACTIONS: Array<ToolbarAction> = [
	{ id: "bold", label: "B", title: "Bold" },
	{ id: "italic", label: "I", title: "Italic" },
	{ id: "strikethrough", label: "S", title: "Strikethrough" },
	{ id: "h1", label: "H1", title: "Heading 1" },
	{ id: "h2", label: "H2", title: "Heading 2" },
	{ id: "bullet", label: "• List", title: "Bulleted list" },
	{ id: "numbered", label: "1. List", title: "Numbered list" },
	{ id: "checklist", label: "Checklist", title: "Checklist" },
	{ id: "quote", label: "Quote", title: "Blockquote" },
	{ id: "inlineCode", label: "`Code`", title: "Inline code" },
	{ id: "codeBlock", label: "{ }", title: "Code block" },
	{ id: "link", label: "Link", title: "Insert link" },
];

const Component = ({
	className,
	note,
	links = NO_LINKS,
	saves = NO_SAVES,
	tagSuggestions = NO_TAGS,
	canLock = false,
	onLockNow,
}: {
	className?: string;
	// A new note has no id until its first save.
	note: {
		id: string | null;
		content: string;
		locked?: boolean;
		title?: string;
		tags?: Array<string>;
	};
	// For attaching a saved note to saved pages; left out, the note
	// cannot be linked from here.
	links?: Array<LinkRow>;
	saves?: Array<Save>;
	tagSuggestions?: ReadonlyArray<string>;
	canLock?: boolean;
	onLockNow?: () => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const navigate = useNavigate();
	const go = useMoveNavigate();
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const storedLocked = Boolean(note.locked);
	const storedTitle = note.title ?? "";
	const storedTags = note.tags ?? NO_TAGS;

	// Unsaved text is remembered for normal notes, so the popup closing does
	// not lose what was being written. Locked notes never persist drafts.
	const draftKey = `note.${note.id ?? "new"}`;
	const { getDraft, setDraft, clearDraft } = useContext(UIStateContext);
	const [remembered] = useState(() => {
		if (storedLocked) return null;
		const draft = getDraft(draftKey);
		return typeof draft === "string" && draft !== note.content
			? draft
			: null;
	});
	const initialContent = remembered ?? note.content;
	const historyRef = useRef<Array<string>>([initialContent]);
	const historyIndexRef = useRef(0);
	const keepRemembered = useRef(remembered !== null);

	const [draftContent, setDraftContent] = useState(initialContent);
	const [baselineContent, setBaselineContent] = useState(note.content);
	const [locked, setLocked] = useState(storedLocked);
	const [baselineLocked, setBaselineLocked] = useState(storedLocked);
	const [title, setTitle] = useState(storedTitle);
	const [baselineTitle, setBaselineTitle] = useState(storedTitle);
	const [tags, setTags] = useState<Array<string>>([...storedTags]);
	const [baselineTags, setBaselineTags] = useState<Array<string>>([
		...storedTags,
	]);
	const [showPasswordHint, setShowPasswordHint] = useState(false);
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);
	const [viewMode, setViewMode] = useState<"edit" | "preview">(
		note.id === null || remembered !== null ? "edit" : "preview",
	);
	const savingRef = useRef(false);

	useEffect(() => {
		if (
			locked ||
			draftContent === baselineContent ||
			draftContent.trim() === ""
		) {
			clearDraft(draftKey);
		} else {
			setDraft(draftKey, draftContent);
		}
	}, [locked, draftContent, baselineContent, draftKey, setDraft, clearDraft]);

	const syncHistoryFlags = useCallback(() => {
		setCanUndo(historyIndexRef.current > 0);
		setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
	}, []);

	const resetHistory = useCallback(
		(content: string) => {
			historyRef.current = [content];
			historyIndexRef.current = 0;
			syncHistoryFlags();
		},
		[syncHistoryFlags],
	);

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

	const [syncedNote, setSyncedNote] = useState({
		id: note.id,
		content: note.content,
		locked: storedLocked,
		title: storedTitle,
		tags: storedTags,
	});
	if (
		syncedNote.id !== note.id ||
		syncedNote.content !== note.content ||
		syncedNote.locked !== storedLocked ||
		syncedNote.title !== storedTitle ||
		!sameTags(syncedNote.tags, storedTags)
	) {
		setSyncedNote({
			id: note.id,
			content: note.content,
			locked: storedLocked,
			title: storedTitle,
			tags: storedTags,
		});
		setBaselineContent(note.content);
		setDraftContent(note.content);
		setBaselineLocked(storedLocked);
		setLocked(storedLocked);
		setBaselineTitle(storedTitle);
		setTitle(storedTitle);
		setBaselineTags([...storedTags]);
		setTags([...storedTags]);
		setViewMode(note.id === null ? "edit" : "preview");
	}
	useEffect(() => {
		if (keepRemembered.current) {
			keepRemembered.current = false;
			return;
		}
		resetHistory(note.content);
	}, [note.id, note.content, resetHistory]);

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

	// The pages this note is attached to. Changes stay local until Update,
	// like the text.
	const noteId = note.id;
	const storedSaveIds = useMemo(
		() =>
			noteId === null
				? []
				: linkedFrom(links, noteId, saves).map((save) => save.id),
		[links, noteId, saves],
	);
	const [editedSaveIds, setEditedSaveIds] = useState<Array<string> | null>(
		null,
	);
	const linkedSaveIds = editedSaveIds ?? storedSaveIds;
	const linksChanged =
		editedSaveIds !== null &&
		(editedSaveIds.length !== storedSaveIds.length ||
			editedSaveIds.some((id) => !storedSaveIds.includes(id)));
	const handleSaveLinking = (saveId: string, flag: boolean) => {
		setEditedSaveIds((prev) => {
			const ids = prev ?? storedSaveIds;
			return flag
				? [...ids.filter((id) => id !== saveId), saveId]
				: ids.filter((id) => id !== saveId);
		});
	};

	const tagsChanged = !sameTags(tags, baselineTags);
	const lockedChanged = locked !== baselineLocked;
	const titleChanged = title.trim() !== baselineTitle.trim();
	const hasChanges =
		draftContent !== baselineContent ||
		linksChanged ||
		tagsChanged ||
		lockedChanged ||
		titleChanged;

	const handleToggleLocked = () => {
		if (!locked && !canLock) {
			setShowPasswordHint(true);
			return;
		}
		setShowPasswordHint(false);
		setLocked((was) => !was);
	};

	const handleSave = async () => {
		if (savingRef.current || !hasChanges || draftContent.trim() === "") {
			return;
		}
		savingRef.current = true;
		try {
			const trimmedTitle = title.trim();
			if (note.id === null) {
				const { id } = await send("note.create", {
					content: draftContent,
					saveIds: linkedSaveIds,
					...(tags.length > 0 ? { tags } : {}),
					...(locked ? { locked: true } : {}),
					...(locked && trimmedTitle !== ""
						? { title: trimmedTitle }
						: {}),
				});
				clearDraft(draftKey);
				if (locked) {
					navigate("/home", { replace: true });
				} else {
					navigate(`/note/${id}`, { replace: true });
				}
				return;
			}
			// One command: the text, metadata and saves change together.
			const updatePayload: {
				id: string;
				content: string;
				saveIds?: Array<string>;
				tags?: Array<string>;
				locked?: boolean;
				title?: string;
			} = {
				id: note.id,
				content: draftContent,
			};
			if (linksChanged) updatePayload.saveIds = linkedSaveIds;
			if (tagsChanged) updatePayload.tags = tags;
			if (lockedChanged) updatePayload.locked = locked;
			if (titleChanged || lockedChanged) {
				updatePayload.title = locked ? trimmedTitle : "";
			}
			await send("note.update", updatePayload);
			setEditedSaveIds(null);
			setBaselineContent(draftContent);
			setBaselineLocked(locked);
			setBaselineTitle(locked ? trimmedTitle : "");
			setTitle(locked ? trimmedTitle : "");
			setBaselineTags([...tags]);
			resetHistory(draftContent);
		} catch (error) {
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't save this note.",
				LTOAST_TYPE.ERROR,
			);
		} finally {
			savingRef.current = false;
		}
	};

	return (
		<div
			className={twMerge(
				`flex min-h-0 w-full grow flex-col overflow-y-auto`,
				className,
			)}
		>
			<LUIFeaturePageUD
				Icon={NotebookIcon}
				title={note.id === null ? "New note" : "Note"}
			/>
			<div
				className={`mx-auto flex min-h-0 w-full max-w-3xl grow flex-col overflow-y-auto ${theme}-scrollbar`}
			>
				<div className="flex w-full items-center justify-between gap-x-2 px-4 py-1.5">
					<div
						className={`flex items-center gap-x-0.5 rounded-xl border p-0.5 ${
							theme === LTHEME.DARK
								? "border-neutral-800 bg-neutral-900"
								: "border-neutral-200 bg-neutral-100"
						}`}
					>
						<button
							type="button"
							aria-pressed={viewMode === "preview"}
							onClick={() => setViewMode("preview")}
							className={`h-7 cursor-pointer rounded-lg px-2.5 text-xs font-medium transition-colors ${
								viewMode === "preview"
									? "ll-accent-fill"
									: theme === LTHEME.DARK
										? "text-neutral-400 hover:text-neutral-100"
										: "text-neutral-600 hover:text-neutral-900"
							}`}
						>
							Preview
						</button>
						<button
							type="button"
							aria-pressed={viewMode === "edit"}
							onClick={() => setViewMode("edit")}
							className={`h-7 cursor-pointer rounded-lg px-2.5 text-xs font-medium transition-colors ${
								viewMode === "edit"
									? "ll-accent-fill"
									: theme === LTHEME.DARK
										? "text-neutral-400 hover:text-neutral-100"
										: "text-neutral-600 hover:text-neutral-900"
							}`}
						>
							Edit
						</button>
					</div>
					<div className="flex items-center gap-x-1">
						{onLockNow ? (
							<button
								type="button"
								aria-label="Lock note now"
								onClick={onLockNow}
								className={`flex h-7 cursor-pointer items-center gap-x-1 rounded-lg px-2 text-xs font-medium transition-colors ${
									isDark
										? "text-neutral-300 hover:bg-neutral-800 hover:text-white"
										: "text-neutral-700 hover:bg-neutral-200 hover:text-black"
								}`}
							>
								<LUIThemedIcon
									Icon={LockIcon}
									color="currentColor"
									weight="fill"
									className="size-3.5 text-[var(--ll-accent)]"
								/>
								<span>Lock</span>
							</button>
						) : null}
						{viewMode === "edit" ? (
							<>
								<button
									type="button"
									className={`flex h-7 items-center gap-x-1 rounded-lg px-2 text-xs font-medium transition-colors ${
										canUndo
											? theme === LTHEME.DARK
												? "cursor-pointer text-neutral-300 hover:bg-neutral-800 hover:text-white"
												: "cursor-pointer text-neutral-700 hover:bg-neutral-200 hover:text-black"
											: "cursor-not-allowed opacity-35"
									}`}
									onMouseDown={(event) =>
										event.preventDefault()
									}
									onClick={handleUndo}
									disabled={!canUndo}
								>
									<LUIThemedIcon
										Icon={ArrowCounterClockwiseIcon}
										color="currentColor"
										weight="regular"
										className="size-3.5"
									/>
									Undo
								</button>
								<button
									type="button"
									className={`flex h-7 items-center gap-x-1 rounded-lg px-2 text-xs font-medium transition-colors ${
										canRedo
											? theme === LTHEME.DARK
												? "cursor-pointer text-neutral-300 hover:bg-neutral-800 hover:text-white"
												: "cursor-pointer text-neutral-700 hover:bg-neutral-200 hover:text-black"
											: "cursor-not-allowed opacity-35"
									}`}
									onMouseDown={(event) =>
										event.preventDefault()
									}
									onClick={handleRedo}
									disabled={!canRedo}
								>
									<LUIThemedIcon
										Icon={ArrowClockwiseIcon}
										color="currentColor"
										weight="regular"
										className="size-3.5"
									/>
									Redo
								</button>
							</>
						) : null}
					</div>
				</div>

				{viewMode === "edit" ? (
					<div className="flex grow flex-col gap-y-2 px-4 py-1.5">
						<div
							className={`flex w-full flex-wrap gap-1 rounded-xl border p-1.5 ${
								theme === LTHEME.DARK
									? "border-neutral-800 bg-neutral-900"
									: "border-neutral-200 bg-neutral-100"
							}`}
						>
							{TOOLBAR_ACTIONS.map((action) => (
								<button
									key={action.id}
									type="button"
									title={action.title}
									aria-label={action.title}
									className={`h-7 cursor-pointer rounded-lg px-2 text-xs font-medium transition-colors active:scale-95 ${
										theme === LTHEME.DARK
											? "bg-neutral-950 text-neutral-200 hover:bg-neutral-800 hover:text-white"
											: "bg-white text-neutral-800 hover:bg-neutral-200 hover:text-black"
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
							className={`min-h-40 w-full grow resize-none overflow-y-auto rounded-xl border px-3 py-2.5 text-sm leading-relaxed transition-colors select-text ${theme}-thin-scrollbar ${
								theme === LTHEME.DARK
									? "border-neutral-700 bg-neutral-900 text-neutral-100 focus:border-neutral-400"
									: "border-neutral-300 bg-white text-neutral-900 focus:border-neutral-600"
							}`}
							value={draftContent}
							aria-label="Note content"
							onChange={(event) =>
								handleDraftChange(event.target.value)
							}
							onKeyDown={(event) => {
								const withModifier =
									event.ctrlKey || event.metaKey;
								if (!withModifier) {
									return;
								}

								const key = event.key.toLowerCase();
								const code = event.code;
								if (key === "b") {
									event.preventDefault();
									handleApplyFormatting("bold");
								}
								if (key === "i") {
									event.preventDefault();
									handleApplyFormatting("italic");
								}
								if (event.shiftKey && key === "x") {
									event.preventDefault();
									handleApplyFormatting("strikethrough");
								}
								if (
									event.shiftKey &&
									(code === "Digit1" || key === "1")
								) {
									event.preventDefault();
									handleApplyFormatting("h1");
								}
								if (
									event.shiftKey &&
									(code === "Digit2" || key === "2")
								) {
									event.preventDefault();
									handleApplyFormatting("h2");
								}
								if (
									event.shiftKey &&
									(code === "Digit8" || key === "8")
								) {
									event.preventDefault();
									handleApplyFormatting("bullet");
								}
								if (
									event.shiftKey &&
									(code === "Digit7" || key === "7")
								) {
									event.preventDefault();
									handleApplyFormatting("numbered");
								}
								if (
									event.shiftKey &&
									(code === "Digit9" || key === "9")
								) {
									event.preventDefault();
									handleApplyFormatting("checklist");
								}
								if (
									event.shiftKey &&
									(code === "Period" ||
										key === "." ||
										key === ">")
								) {
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
						<LUITagInput
							tags={tags}
							onChange={setTags}
							suggestions={tagSuggestions}
						/>
						<div
							className={`flex flex-col gap-y-2 rounded-xl border px-3 py-2 ${
								isDark
									? "border-neutral-800 bg-neutral-900/70"
									: "border-neutral-200 bg-neutral-100/70"
							}`}
						>
							<div className="flex items-center justify-between gap-x-2">
								<div className="flex min-w-0 flex-col">
									<span
										className={`text-xs font-medium ${
											isDark
												? "text-neutral-200"
												: "text-neutral-800"
										}`}
									>
										Lock with password
									</span>
									<span
										className={`text-[11px] ${
											isDark
												? "text-neutral-400"
												: "text-neutral-500"
										}`}
									>
										Requires your profile password to open
										and stays hidden from Little AI.
									</span>
								</div>
								<button
									type="button"
									role="switch"
									aria-checked={locked}
									aria-label="Lock with password"
									onClick={handleToggleLocked}
									className={`flex h-8 shrink-0 cursor-pointer items-center gap-x-1.5 rounded-xl border px-2.5 text-xs font-medium transition-colors ${
										locked
											? "ll-accent-fill border-transparent"
											: isDark
												? "border-neutral-700 bg-neutral-950 text-neutral-300 hover:bg-neutral-800"
												: "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-200"
									}`}
								>
									<LUIThemedIcon
										Icon={locked ? LockIcon : LockOpenIcon}
										color="currentColor"
										weight={locked ? "fill" : "regular"}
										className="size-3.5"
									/>
									<span>{locked ? "Locked" : "Off"}</span>
								</button>
							</div>
							{showPasswordHint && !canLock ? (
								<div className="flex flex-wrap items-center justify-between gap-2 pt-1">
									<LUINote warning className="min-w-0 grow">
										Set a profile password first to lock
										notes.
									</LUINote>
									<LUIPillButton
										label="Set password"
										onClick={() =>
											go(
												"/settings/security/password",
												"forward",
												{
													state: {
														referrer:
															note.id !== null
																? `/note/${note.id}`
																: "/home/new-note",
													},
												},
											)
										}
									/>
								</div>
							) : null}
							{locked ? (
								<input
									type="text"
									value={title}
									maxLength={100}
									aria-label="Visible title for locked note"
									placeholder="Visible title (optional, defaults to Locked note)"
									onChange={(event) =>
										setTitle(event.target.value)
									}
									className={`ll-field h-9 w-full rounded-xl border px-3 text-xs transition-colors ${
										isDark
											? "border-neutral-700 bg-neutral-950 text-neutral-100 placeholder:text-neutral-500"
											: "border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400"
									}`}
								/>
							) : null}
						</div>
						{note.id !== null ? (
							<LUIVBMLinks
								saves={saves}
								linkedSaveIds={linkedSaveIds}
								handleSaveLinking={handleSaveLinking}
							/>
						) : null}
					</div>
				) : (
					<div
						className={`w-full grow overflow-y-auto px-4 py-2 text-sm leading-relaxed select-text ${theme}-thin-scrollbar ${theme === LTHEME.DARK ? "text-neutral-100" : "text-neutral-900"}`}
					>
						{tags.length > 0 ? (
							<LUITagChips
								tags={tags}
								maxVisible={15}
								className="mb-2.5"
							/>
						) : null}
						<ReactMarkdown
							remarkPlugins={[remarkGfm, remarkBreaks]}
							urlTransform={safeUrlTransform}
							components={{
								a: SafeMarkdownLink,
								img: SafeMarkdownImage,
								h1: ({ ...props }) => (
									<h1
										{...props}
										className="mb-2 text-xl font-semibold tracking-tight"
									/>
								),
								h2: ({ ...props }) => (
									<h2
										{...props}
										className="mb-2 text-lg font-semibold tracking-tight"
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
												? "border-neutral-600 text-neutral-400"
												: "border-neutral-400 text-neutral-600"
										}`}
									/>
								),
								code: ({ ...props }) => (
									<code
										{...props}
										className={`rounded-md px-1.5 py-0.5 text-xs ${
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
			{viewMode === "edit" || hasChanges ? (
				<div className="mx-auto flex h-16 w-full max-w-3xl shrink-0 items-center justify-center px-4 pt-1 pb-2">
					<LUICUButton
						name={note.id === null ? "Create" : "Update"}
						onClick={handleSave}
						passedTheme={theme}
						disabled={draftContent.trim() === "" || !hasChanges}
					/>
				</div>
			) : null}
		</div>
	);
};

export { Component as LUINoteDetailForm };
