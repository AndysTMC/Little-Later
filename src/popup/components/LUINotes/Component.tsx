import { useMemo, useState } from "react";
import { LTHEME } from "little-shared/enums";
import { LNote } from "little-shared/types";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";
import { LDateUtl } from "little-shared/utils/datetime";
import { createNote, deleteNote } from "../../../services/note";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { NoteBlankIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { LUINoteMini } from "../LUINoteMini/Component";

const Component = ({
	className,
	notes,
	showCreate = true,
	emptyMessage = "No notes yet?",
}: {
	className?: string;
	notes: Array<LNote>;
	showCreate?: boolean;
	emptyMessage?: string;
}) => {
	const { theme } = useTheme();
	const navigate = useNavigate();
	const [isCreating, setIsCreating] = useState(false);

	const sortedNotes = useMemo(
		() =>
			[...notes].sort((a, b) =>
				LDateUtl.from(a.lastModificationDate).lt(b.lastModificationDate)
					? 1
					: -1,
			),
		[notes],
	);

	const createNewNote = async () => {
		if (isCreating) {
			return;
		}
		setIsCreating(true);
		try {
			const noteId = await createNote({ content: "" });
			navigate(`/note/${noteId}`);
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col overflow-y-hidden pb-1`,
				className,
			)}
		>
			{showCreate ? (
				<div className="flex h-10 w-full shrink-0 items-end justify-start gap-x-1 px-4">
					<div
						className={`flex h-full items-center justify-center text-2xl leading-none font-extrabold ${
							theme === LTHEME.DARK ? "text-white" : "text-black"
						}`}
					>
						New Note
					</div>
					<button
						type="button"
						className="flex h-full w-max cursor-pointer items-center justify-center active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
						onClick={createNewNote}
						disabled={isCreating}
					>
						<LUIThemedIcon
							Icon={NoteBlankIcon}
							color={theme === LTHEME.DARK ? "white" : "black"}
							weight="light"
							className="size-6"
						/>
					</button>
				</div>
			) : null}

			{sortedNotes.length > 0 ? (
				<div className={`w-full grow overflow-y-auto px-4 pb-2 ${theme}-scrollbar`}>
					<div className="columns-2 gap-3 [column-fill:_balance]">
						{sortedNotes.map((note) => (
							<LUINoteMini
								key={note.id}
								note={note}
								onOpen={(selectedNote) =>
									navigate(`/note/${selectedNote.id}`)
								}
								onDelete={deleteNote}
							/>
						))}
					</div>
				</div>
			) : (
				<div
					className={`flex h-full w-full flex-col items-center justify-center py-8 ${
						theme === LTHEME.DARK ? "text-white" : "text-black"
					}`}
				>
					<div className="text-5xl font-extrabold text-pretty opacity-10">
						{emptyMessage}
					</div>
					{showCreate ? (
						<div className="text-5xl font-extrabold text-pretty opacity-10">
							Tap New Note!
						</div>
					) : null}
				</div>
			)}
		</motion.div>
	);
};

export { Component as LUINotes };

