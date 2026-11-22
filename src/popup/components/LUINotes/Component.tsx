import { useMemo, useState } from "react";
import { LTHEME } from "little-shared/enums";
import type { Note } from "../../../storage/repositories";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { motion } from "framer-motion";
import { send } from "../../../utils/send";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { LUINoteMini } from "../LUINoteMini/Component";
import { LUIEmptyState } from "../LUIEmptyState/Component";

const Component = ({
	className,
	notes,
	showCreate = true,
	activeTag = null,
	onSelectTag,
	emptyMessage = "No notes yet?",
}: {
	className?: string;
	notes: Array<Note>;
	showCreate?: boolean;
	activeTag?: string | null;
	onSelectTag?: (tag: string) => void;
	emptyMessage?: string;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const go = useMoveNavigate();
	const [filter, setFilter] = useState<"all" | "locked">("all");

	const lockedCount = useMemo(
		() => notes.filter((note) => note.locked).length,
		[notes],
	);
	const effectiveFilter = lockedCount > 0 ? filter : "all";

	const sortedNotes = useMemo(
		() =>
			[...notes]
				.filter((note) =>
					effectiveFilter === "locked" ? note.locked : true,
				)
				.sort((a, b) => b.updatedAt - a.updatedAt),
		[notes, effectiveFilter],
	);

	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col overflow-y-hidden pb-1`,
				className,
			)}
		>
			{notes.length > 0 ? (
				<div className="mx-auto flex h-10 w-full max-w-3xl shrink-0 items-center justify-between px-4">
					<span
						className={`text-xs font-medium ${
							isDark ? "text-neutral-400" : "text-neutral-500"
						}`}
					>
						{sortedNotes.length} note
						{sortedNotes.length === 1 ? "" : "s"}
					</span>
					{lockedCount > 0 ? (
						<div
							role="group"
							aria-label="Filter notes"
							className={`flex items-center gap-x-0.5 rounded-xl border p-0.5 ${
								isDark
									? "border-neutral-800 bg-neutral-900"
									: "border-neutral-200 bg-neutral-100"
							}`}
						>
							{(["all", "locked"] as const).map((mode) => {
								const selected = effectiveFilter === mode;
								return (
									<button
										key={mode}
										type="button"
										aria-pressed={selected}
										onClick={() => setFilter(mode)}
										className={`h-6 cursor-pointer rounded-lg px-2.5 text-xs font-medium transition-colors ${
											selected
												? "ll-accent-fill"
												: isDark
													? "text-neutral-400 hover:text-neutral-100"
													: "text-neutral-600 hover:text-neutral-900"
										}`}
									>
										{mode === "all"
											? "All"
											: `Locked (${lockedCount})`}
									</button>
								);
							})}
						</div>
					) : null}
				</div>
			) : null}

			{sortedNotes.length > 0 ? (
				<div
					className={`w-full grow overflow-y-auto px-4 pb-3 ${theme}-scrollbar`}
				>
					<div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2.5 min-[560px]:grid-cols-2">
						{sortedNotes.map((note) => (
							<LUINoteMini
								key={note.id}
								note={note}
								activeTag={activeTag}
								onSelectTag={onSelectTag}
								onOpen={(selectedNote) =>
									go(`/note/${selectedNote.id}`, "forward")
								}
								onDelete={(id) => send("note.delete", { id })}
							/>
						))}
					</div>
				</div>
			) : (
				<LUIEmptyState
					title={emptyMessage}
					hint={showCreate ? "Tap New note." : undefined}
				/>
			)}
		</motion.div>
	);
};

export { Component as LUINotes };
