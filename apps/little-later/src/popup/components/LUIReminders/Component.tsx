import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { LUIReminderMini } from "../LUIReminderMini/Component";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import { LLink, LReminder, LVisualBM } from "little-shared/types";
import { LDateUtl } from "little-shared/utils/datetime";
import { usePagination } from "../../hooks/usePagination";
import { useMemo } from "react";
import { LUIPagination } from "../LUIPagination/Component";

const Component = ({
	className,
	links,
	reminders,
	saves,
}: {
	className?: string;
	links: Array<LLink>;
	reminders: Array<LReminder>;
	saves: Array<LVisualBM>;
}) => {
	const { theme } = useTheme();

	const { startIndex, endIndex, currentBatch, batchCount, onBatchChange } =
		usePagination(reminders.length, 20);

	const paginationReminders = useMemo(
		() =>
			reminders
				.sort((a, b) => LDateUtl.compare(a.targetDate, b.targetDate))
				.slice(startIndex, endIndex) || [],
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
								key={reminder.id}
								reminder={reminder}
							/>
						))}
					</div>
				</div>
			) : (
				<div
					className={`flex h-full w-full flex-col items-center justify-center py-8 ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
				>
					<div
						className={`text-5xl font-extrabold text-pretty opacity-10`}
					>
						No alerts?
					</div>
					<div
						className={`text-5xl font-extrabold text-pretty opacity-10`}
					>
						Start browsing!
					</div>
				</div>
			)}
		</motion.div>
	);
};

export { Component as LUIReminders };
