import { motion } from "framer-motion";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { LUIVBMMini } from "../LUIVBMMini/Component";
import type { Note, Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { useMemo, useState } from "react";
import { usePagination } from "../../hooks/usePagination";
import { LUIPagination } from "../LUIPagination/Component";
import { LUIEmptyState } from "../LUIEmptyState/Component";

const Component = ({
	className,
	links,
	notes,
	reminders,
	saves,
	tasks,
	activeTag = null,
	onSelectTag,
}: {
	className?: string;
	links: Array<LinkRow>;
	notes: Array<Note>;
	reminders: Array<Reminder>;
	saves: Array<Save>;
	tasks: Array<Task>;
	activeTag?: string | null;
	onSelectTag?: (tag: string) => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const [view, setView] = useState<"active" | "archived">("active");

	const activeSaves = useMemo(
		() => saves.filter((save) => !save.archived),
		[saves],
	);
	const archivedSaves = useMemo(
		() => saves.filter((save) => save.archived),
		[saves],
	);
	const effectiveView = archivedSaves.length > 0 ? view : "active";
	const visibleSaves =
		effectiveView === "archived" ? archivedSaves : activeSaves;

	const { startIndex, endIndex, batchCount, currentBatch, onBatchChange } =
		usePagination(visibleSaves.length, 5);

	const paginationSaves = useMemo(() => {
		return [...visibleSaves]
			.sort((a, b) => b.browsedAt - a.browsedAt)
			.slice(startIndex, endIndex);
	}, [visibleSaves, startIndex, endIndex]);

	const handleViewChange = (nextView: "active" | "archived") => {
		setView(nextView);
		onBatchChange(1);
	};

	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col select-none ${isDark ? "bg-black" : "bg-white"} overflow-y-hidden`,
				className,
			)}
		>
			{saves.length > 0 ? (
				<div className="mx-auto flex w-full max-w-3xl shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-1.5">
					<div className="flex items-center gap-x-2.5">
						<span
							className={`text-xs font-medium ${
								isDark ? "text-neutral-400" : "text-neutral-500"
							}`}
						>
							{visibleSaves.length} save
							{visibleSaves.length === 1 ? "" : "s"}
						</span>
						{batchCount > 1 ? (
							<LUIPagination
								currentBatch={currentBatch}
								batchCount={batchCount}
								onBatchChange={onBatchChange}
							/>
						) : null}
					</div>
					{archivedSaves.length > 0 ? (
						<div
							role="group"
							aria-label="Filter saves"
							className={`flex items-center gap-x-0.5 rounded-xl border p-0.5 ${
								isDark
									? "border-neutral-800 bg-neutral-900"
									: "border-neutral-200 bg-neutral-100"
							}`}
						>
							{(["active", "archived"] as const).map((mode) => {
								const selected = effectiveView === mode;
								return (
									<button
										key={mode}
										type="button"
										aria-pressed={selected}
										onClick={() => handleViewChange(mode)}
										className={`h-6 cursor-pointer rounded-lg px-2.5 text-xs font-medium transition-colors ${
											selected
												? "ll-accent-fill"
												: isDark
													? "text-neutral-400 hover:text-neutral-100"
													: "text-neutral-600 hover:text-neutral-900"
										}`}
									>
										{mode === "active"
											? `Active (${activeSaves.length})`
											: `Archived (${archivedSaves.length})`}
									</button>
								);
							})}
						</div>
					) : null}
				</div>
			) : null}

			{paginationSaves.length > 0 ? (
				<div
					className={`flex h-full w-full flex-col gap-y-1 overflow-y-hidden`}
				>
					<div
						className={`w-full grow overflow-y-auto ${theme}-scrollbar px-4 pt-1`}
					>
						<div className="mx-auto flex w-full max-w-3xl flex-col gap-y-2">
							{paginationSaves.map((save) => (
								<LUIVBMMini
									key={save.id}
									links={links}
									notes={notes}
									reminders={reminders}
									tasks={tasks}
									save={save}
									activeTag={activeTag}
									onSelectTag={onSelectTag}
								/>
							))}
							<span className="h-2 w-full" />
						</div>
					</div>
				</div>
			) : (
				<LUIEmptyState
					title={
						effectiveView === "archived"
							? "No archived saves"
							: "No saves yet?"
					}
					hint={
						effectiveView === "archived"
							? undefined
							: archivedSaves.length > 0
								? "All your saves are archived."
								: "Browse a page or check History."
					}
				/>
			)}
		</motion.div>
	);
};

export { Component as LUIVBMs };
