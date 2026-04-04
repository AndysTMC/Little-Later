import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { LUIGroup } from "../LUIGroup/Component";
import { LUITaskMini } from "../LUITaskMini/Component";
import { LLink, LReminder, LTask, LVisualBM } from "little-shared/types";
import { twMerge } from "tailwind-merge";
import { isTaskFinished, isTaskActive } from "little-shared/utils/task";
import { usePagination } from "../../hooks/usePagination";
import { useEffect, useMemo, useState } from "react";

const Component = ({
	className,
	links,
	reminders,
	saves,
	tasks,
}: {
	className?: string;
	links: Array<LLink>;
	reminders: Array<LReminder>;
	saves: Array<LVisualBM>;
	tasks: Array<LTask>;
}) => {
	const { theme } = useTheme();

	const finishedTasks = useMemo(() => tasks.filter(isTaskFinished), [tasks]);

	const activeTasks = tasks.filter((task) => isTaskActive(task));

	const missedTasks = tasks.filter(
		(task) =>
			!activeTasks.find((x) => x.id === task.id) &&
			!finishedTasks.find((x) => x.id === task.id),
	);

	const { startIndex, endIndex, currentBatch, batchCount, onBatchChange } =
		usePagination(finishedTasks.length, 20);

	const paginationFinishedTasks = useMemo(
		() => finishedTasks.slice(startIndex, endIndex),
		[finishedTasks, startIndex, endIndex],
	);

	const [, setTrigger] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setTrigger((t) => t + 1);
		}, 15000);

		return () => clearInterval(interval);
	}, []);

	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-auto px-4 ${theme}-scrollbar`,
				className,
			)}
		>
			<LUIGroup title="Missed">
				{missedTasks.map((task) => (
					<LUITaskMini
						links={links}
						reminders={reminders}
						saves={saves}
						key={task.id}
						task={task}
					/>
				))}
			</LUIGroup>
			<LUIGroup title="Active">
				{activeTasks.map((task) => (
					<LUITaskMini
						links={links}
						reminders={reminders}
						saves={saves}
						key={task.id}
						task={task}
					/>
				))}
			</LUIGroup>
			<LUIGroup
				title="Finished"
				pagination={{ currentBatch, batchCount, onBatchChange }}
			>
				{paginationFinishedTasks.map((task) => (
					<LUITaskMini
						links={links}
						reminders={reminders}
						saves={saves}
						key={task.id}
						task={task}
					/>
				))}
			</LUIGroup>
			{tasks.length <= 1 ? (
				<div
					className={`flex min-h-52 w-full grow flex-col items-center justify-center py-8 ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
				>
					<div
						className={`text-5xl font-extrabold text-pretty opacity-10`}
					>
						Quick Add,
					</div>
					<div
						className={`text-5xl font-extrabold text-pretty opacity-10`}
					>
						Easy Track!
					</div>
				</div>
			) : null}
		</motion.div>
	);
};

export { Component as LUITasks };
