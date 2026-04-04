import { useMemo, useState } from "react";
import { LTHEME } from "little-shared/enums";
import { LNote } from "little-shared/types";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";
import { LDateUtl } from "little-shared/utils/datetime";
import { usePagination } from "../../hooks/usePagination";
import { LUIPagination } from "../LUIPagination/Component";
import { createNote, deleteNote, updateNote } from "../../../services/note";
import { fakeWait } from "little-shared/utils/misc";
import { LUINote } from "../LUINote/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { NoteBlankIcon, TrashIcon } from "@phosphor-icons/react";

const Component = ({
	className,
	notes,
}: {
	className?: string;
	notes: Array<LNote>;
}) => {
	const { theme } = useTheme();
	const [editNoteId, setEditNoteId] = useState<number | null>(null);

	const sortedNotes = useMemo(
		() =>
			[...notes].sort((a, b) =>
				LDateUtl.from(a.lastModificationDate).lt(b.lastModificationDate)
					? 1
					: -1,
			),
		[notes],
	);

	const { startIndex, endIndex, batchCount, currentBatch, onBatchChange } =
		usePagination(sortedNotes.length, 10);

	const paginationNotes = useMemo(
		() => sortedNotes.slice(startIndex, endIndex),
		[sortedNotes, startIndex, endIndex],
	);

	const createNewNote = async () => {
		await createNote({ content: "" });
	};

	const handleUpdateNote = async (modifiedNote: LNote) => {
		await updateNote(modifiedNote.id, modifiedNote);
	};

	const handleDeleteNote = async (noteId: number) => {
		await deleteNote(noteId);
	};

	const handleFocusNote = async (noteId: number) => {
		if (editNoteId === noteId) {
			return;
		}
		setEditNoteId(noteId);
		if (editNoteId !== null) {
			await handleUnFocusNote(editNoteId);
		}
	};

	const handleUnFocusNote = async (noteId: number) => {
		if (editNoteId === noteId) {
			setEditNoteId(null);
			await fakeWait();
			await updateNote(noteId, {
				lastModificationDate: LDateUtl.getNow(),
			});
		}
	};

	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col overflow-y-hidden pb-1`,
				className,
			)}
		>
			<div className={`flex h-10 w-full shrink-0 items-end justify-start gap-x-1 px-4`}>
				<div
					className={`flex h-full items-center justify-center text-2xl font-extrabold ${
						theme === LTHEME.DARK ? "text-white" : "text-black"
					} leading-none`}
				>
					New Note
				</div>
				<div
					className={`flex h-full w-max cursor-pointer items-center justify-center active:scale-95`}
					onClick={createNewNote}
				>
					<LUIThemedIcon
						Icon={NoteBlankIcon}
						color={theme === LTHEME.DARK ? "white" : "black"}
						weight="light"
						className={`size-6`}
					/>
				</div>
			</div>

			{batchCount > 1 ? (
				<div className="flex h-max w-full shrink-0 px-4 py-1">
					<LUIPagination
						currentBatch={currentBatch}
						batchCount={batchCount}
						onBatchChange={onBatchChange}
					/>
				</div>
			) : null}

			{paginationNotes.length > 0 ? (
				<div
					className={`flex w-full grow flex-col gap-y-1 overflow-y-auto ${theme}-scrollbar px-4`}
				>
					{paginationNotes.map((note) => (
						<div key={note.id} className={`flex h-max w-full items-start gap-x-2`}>
							<LUINote
								note={note}
								onNoteChange={handleUpdateNote}
								editNoteId={editNoteId}
								focus={handleFocusNote}
								unFocus={handleUnFocusNote}
							/>
							<div
								className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg active:scale-95`}
								onClick={() => handleDeleteNote(note.id)}
							>
								<LUIThemedIcon
									Icon={TrashIcon}
									color={theme === LTHEME.DARK ? "white" : "black"}
									weight="light"
									className={`size-6`}
								/>
							</div>
						</div>
					))}
				</div>
			) : (
				<div
					className={`flex h-full w-full flex-col items-center justify-center py-8 ${
						theme === LTHEME.DARK ? "text-white" : "text-black"
					}`}
				>
					<div className={`text-5xl font-extrabold text-pretty opacity-10`}>
						No notes yet?
					</div>
					<div className={`text-5xl font-extrabold text-pretty opacity-10`}>
						Tap New Note!
					</div>
				</div>
			)}
		</motion.div>
	);
};

export { Component as LUIHomeNotes };
