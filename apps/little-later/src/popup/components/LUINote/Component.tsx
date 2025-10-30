import { useTheme } from "../../hooks/useTheme";
import { LNote } from "little-shared/types";
import { LTHEME } from "little-shared/enums";
import { useEffect, useLayoutEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Markdown from "react-markdown";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { XCircleIcon } from "@phosphor-icons/react";

const Component = ({
	className,
	note,
	onNoteChange,
	editNoteId,
	focus,
	unFocus,
}: {
	className?: string;
	note: LNote;
	onNoteChange: (note: LNote) => Promise<void>;
	editNoteId: number | null;
	focus: (noteId: number) => Promise<void>;
	unFocus: (noteId: number) => Promise<void>;
}) => {
	const { theme } = useTheme();
	const noteChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const noteUpdateTimeChangeTimeoutRef = useRef<number | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const adjustHeight = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	};

	useEffect(() => {
		setTimeout(() => {
			adjustHeight();
		}, 1);
		if (textareaRef.current) {
			textareaRef.current.value = note.content;
		}
	}, [note, note.content, onNoteChange]);

	const handleNoteChange = (newContent: string) => {
		if (noteChangeTimeoutRef.current) {
			clearTimeout(noteChangeTimeoutRef.current);
		}
		noteChangeTimeoutRef.current = setTimeout(async () => {
			await onNoteChange({
				...note,
				content: newContent,
			});
		}, 1000);
		if (noteUpdateTimeChangeTimeoutRef.current) {
			clearTimeout(noteUpdateTimeChangeTimeoutRef.current);
		}
		adjustHeight();
	};

	const handleClose = async () => {
		await unFocus(note.id);
	};

	const actions = {
		get_indices: () => {
			let startIndex =
				textareaRef.current?.selectionStart ?? note.content.length;
			let endIndex =
				textareaRef.current?.selectionEnd ?? note.content.length;
			while (startIndex < endIndex && note.content[startIndex] === " ") {
				startIndex++;
			}
			while (
				startIndex < endIndex &&
				note.content[endIndex - 1] === " "
			) {
				endIndex--;
			}
			return [startIndex, endIndex];
		},
		bold: () => {
			const [startIndex, endIndex] = actions.get_indices();
			handleNoteChange(
				note.content.slice(0, startIndex) +
					`**${note.content.slice(startIndex, endIndex)}**` +
					note.content.slice(endIndex),
			);
		},
		italic: () => {
			const [startIndex, endIndex] = actions.get_indices();
			handleNoteChange(
				note.content.slice(0, startIndex) +
					`_${note.content.slice(startIndex, endIndex)}_` +
					note.content.slice(endIndex),
			);
		},
	};

	const isFocused = editNoteId === note.id;

	useLayoutEffect(() => {
		if (note.id === editNoteId && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [editNoteId, note]);

	return (
		<div
			ref={containerRef}
			className={twMerge(
				`h-max w-full border ${theme === LTHEME.DARK ? "bg-neutral-800" : "bg-neutral-200"} ${
					isFocused
						? "my-1 bg-transparent shadow-sm" +
							(theme === LTHEME.DARK
								? " border-neutral-600"
								: " border-neutral-400")
						: "border-transparent"
				} overflow-clip rounded-lg transition-all duration-300 ${theme === LTHEME.DARK ? "caret-white" : "caret-black"} cursor-text`,
				className,
			)}
		>
			<AnimatePresence>
				{isFocused && (
					<motion.div
						className={`flex h-8 w-full border-b ${
							theme === LTHEME.DARK
								? "border-neutral-600"
								: "border-neutral-400"
						} `}
						initial={{ opacity: 0, y: "-100%" }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.3 }}
						exit={{ opacity: 0, y: "-100%" }}
					>
						<div className={`flex h-full grow justify-start`}>
							<button
								className={`flex h-8 w-8 cursor-pointer items-center justify-center border-r active:scale-95 ${
									theme === LTHEME.DARK
										? "border-neutral-700 text-neutral-300"
										: "border-neutral-300 text-neutral-700"
								} `}
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => actions.bold()}
							>
								<span className="font-bold">B</span>
							</button>
							<button
								className={`flex h-8 w-8 cursor-pointer items-center justify-center border-r active:scale-95 ${
									theme === LTHEME.DARK
										? "border-neutral-700 text-neutral-300"
										: "border-neutral-300 text-neutral-700"
								} `}
								onMouseDown={(e) => e.preventDefault()}
								onClick={() => actions.italic()}
							>
								<span className="italic">I</span>
							</button>
						</div>
						<button
							className={`flex h-8 w-8 cursor-pointer items-center justify-center active:scale-95`}
							onClick={handleClose}
						>
							<LUIThemedIcon
								Icon={XCircleIcon}
								color={
									theme === LTHEME.DARK ? "white" : "black"
								}
								weight="fill"
								className={`size-5`}
							/>
						</button>
					</motion.div>
				)}
			</AnimatePresence>
			<div className="h-max w-full">
				{isFocused ? (
					<textarea
						ref={textareaRef}
						className={`h-max w-full resize-none overflow-hidden text-pretty transition-all duration-200 outline-none ${theme === LTHEME.DARK ? "bg-neutral-800 text-white" : "bg-neutral-200 text-black"} block p-2`}
						onChange={(e) => handleNoteChange(e.target.value)}
						autoFocus
						onKeyDown={(e) => {
							if (e.ctrlKey && e.key === "b") {
								actions.bold();
							}
							if (e.ctrlKey && e.key === "i") {
								actions.italic();
							}
							if (e.key === "Escape") {
								handleClose();
							}
						}}
					/>
				) : (
					<AnimatePresence mode="wait">
						<motion.div
							className={`h-max w-full overflow-x-hidden px-2 py-2 break-all ${theme === LTHEME.DARK ? "caret-black" : "caret-white"} ${
								note.content.length > 0
									? theme === LTHEME.DARK
										? "text-white"
										: "text-black"
									: "text-neutral-500 opacity-50"
							} `}
							onClick={() => focus(note.id)}
							initial={{ opacity: 0, y: -2 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -2 }}
							transition={{ duration: 0.5 }}
						>
							<Markdown>
								{note.content.length > 0
									? note.content.replace(/\n/g, "  \n")
									: "Empty"}
							</Markdown>
						</motion.div>
					</AnimatePresence>
				)}
			</div>
		</div>
	);
};

export { Component as LUINote };
