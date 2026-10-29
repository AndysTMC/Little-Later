import { useMemo } from "react";
import { LTHEME } from "little-shared/enums";
import type { Note } from "../../../storage/repositories";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";
import { send } from "../../../utils/send";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { NoteBlankIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { LUINoteMini } from "../LUINoteMini/Component";
import { LUIEmptyState } from "../LUIEmptyState/Component";

const Component = ({
	className,
	notes,
	showCreate = true,
	emptyMessage = "No notes yet?",
}: {
	className?: string;
	notes: Array<Note>;
	showCreate?: boolean;
	emptyMessage?: string;
}) => {
	const { theme } = useTheme();
	const navigate = useNavigate();
	const sortedNotes = useMemo(
		() => [...notes].sort((a, b) => b.updatedAt - a.updatedAt),
		[notes],
	);

	// A note is stored once it has content, from its page.
	const createNewNote = () => {
		navigate("/note/new");
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
						aria-label="Create note"
						className="flex h-full w-max cursor-pointer items-center justify-center active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
						onClick={createNewNote}
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
				<div
					className={`w-full grow overflow-y-auto px-4 pb-2 ${theme}-scrollbar`}
				>
					<div className="columns-2 gap-3 [column-fill:_balance]">
						{sortedNotes.map((note) => (
							<LUINoteMini
								key={note.id}
								note={note}
								onOpen={(selectedNote) =>
									navigate(`/note/${selectedNote.id}`)
								}
								onDelete={(id) => send("note.delete", { id })}
							/>
						))}
					</div>
				</div>
			) : (
				<LUIEmptyState
					title={emptyMessage}
					hint={showCreate ? "Tap New Note." : undefined}
				/>
			)}
		</motion.div>
	);
};

export { Component as LUINotes };
