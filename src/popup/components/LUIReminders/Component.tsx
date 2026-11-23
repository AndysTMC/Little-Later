import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { LUIReminderMini } from "../LUIReminderMini/Component";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import type { Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { usePagination } from "../../hooks/usePagination";
import { useMemo } from "react";
import { LUIEmptyState } from "../LUIEmptyState/Component";
import { LUIGroup } from "../LUIGroup/Component";

const Component = ({
	className,
	links,
	reminders,
	saves,
	tasks,
	activeTag = null,
	onSelectTag,
}: {
	className?: string;
	links: Array<LinkRow>;
	reminders: Array<Reminder>;
	saves: Array<Save>;
	tasks: Array<Task>;
	activeTag?: string | null;
	onSelectTag?: (tag: string) => void;
}) => {
	const { theme } = useTheme();

	// A reminder that has fired for the last time (nextFireAt 0) is kept as
	// history. Upcoming ones come first, soonest first; past ones follow,
	// most recent first, so they never bury what is still to come.
	const upcoming = useMemo(
		() =>
			reminders
				.filter((reminder) => reminder.nextFireAt !== 0)
				.sort((a, b) => a.target - b.target),
		[reminders],
	);
	const past = useMemo(
		() =>
			reminders
				.filter((reminder) => reminder.nextFireAt === 0)
				.sort((a, b) => b.target - a.target),
		[reminders],
	);

	const { startIndex, endIndex, currentBatch, batchCount, onBatchChange } =
		usePagination(past.length, 25);
	const paginationPast = useMemo(
		() => past.slice(startIndex, endIndex),
		[past, startIndex, endIndex],
	);

	const mini = (reminder: Reminder) => (
		<LUIReminderMini
			links={links}
			saves={saves}
			tasks={tasks}
			key={reminder.id}
			reminder={reminder}
			activeTag={activeTag}
			onSelectTag={onSelectTag}
		/>
	);

	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-auto ${theme}-scrollbar px-4 pb-24`,
				className,
			)}
		>
			<div className="mx-auto flex w-full max-w-3xl grow flex-col">
				{reminders.length > 0 ? (
					<div className="flex h-8 w-full shrink-0 items-center justify-between">
						<span
							className={`text-xs font-medium ${
								theme === LTHEME.DARK
									? "text-neutral-400"
									: "text-neutral-500"
							}`}
						>
							{reminders.length} reminder
							{reminders.length === 1 ? "" : "s"}
						</span>
					</div>
				) : null}
				{upcoming.length > 0 ? (
					<LUIGroup title="Upcoming">{upcoming.map(mini)}</LUIGroup>
				) : null}
				{past.length > 0 ? (
					<LUIGroup
						title="Past"
						pagination={{ currentBatch, batchCount, onBatchChange }}
					>
						{paginationPast.map(mini)}
					</LUIGroup>
				) : null}
				{reminders.length === 0 ? (
					<LUIEmptyState
						title="No reminders yet?"
						hint="Tap New reminder."
					/>
				) : null}
			</div>
		</motion.div>
	);
};

export { Component as LUIReminders };
