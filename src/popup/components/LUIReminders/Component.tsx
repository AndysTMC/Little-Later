import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { LUIReminderMini } from "../LUIReminderMini/Component";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import type { Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { usePagination } from "../../hooks/usePagination";
import { useMemo } from "react";
import { LUIPagination } from "../LUIPagination/Component";
import { LUIEmptyState } from "../LUIEmptyState/Component";

const Component = ({
	className,
	links,
	reminders,
	saves,
	tasks,
}: {
	className?: string;
	links: Array<LinkRow>;
	reminders: Array<Reminder>;
	saves: Array<Save>;
	tasks: Array<Task>;
}) => {
	const { theme } = useTheme();

	const { startIndex, endIndex, currentBatch, batchCount, onBatchChange } =
		usePagination(reminders.length, 20);

	const paginationReminders = useMemo(
		() =>
			[...reminders]
				.sort((a, b) => a.target - b.target)
				.slice(startIndex, endIndex),
		[reminders, startIndex, endIndex],
	);

	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-auto ${theme}-scrollbar`,
				className,
			)}
		>
			{paginationReminders.length > 0 ? (
				<div
					className={`flex h-full w-full flex-col gap-y-1 overflow-y-hidden`}
				>
					{batchCount > 1 ? (
						<div className="flex h-max w-full shrink-0 px-4 py-1">
							<LUIPagination
								currentBatch={currentBatch}
								batchCount={batchCount}
								onBatchChange={onBatchChange}
							/>
						</div>
					) : null}

					<div
						className={`flex w-full grow flex-col gap-y-1 overflow-y-auto ${theme}-scrollbar px-4`}
					>
						{paginationReminders.map((reminder) => (
							<LUIReminderMini
								links={links}
								saves={saves}
								tasks={tasks}
								key={reminder.id}
								reminder={reminder}
							/>
						))}
					</div>
				</div>
			) : (
				<LUIEmptyState
					title="No reminders yet?"
					hint="Tap New Reminder."
				/>
			)}
		</motion.div>
	);
};

export { Component as LUIReminders };
