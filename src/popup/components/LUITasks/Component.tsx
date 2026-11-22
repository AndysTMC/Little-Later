import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { LUIGroup } from "../LUIGroup/Component";
import { LUIEmptyState } from "../LUIEmptyState/Component";
import { LUITaskMini } from "../LUITaskMini/Component";
import type { Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { twMerge } from "tailwind-merge";
import { taskStatus } from "../../records";
import { usePagination } from "../../hooks/usePagination";
import { useEffect, useMemo, useState } from "react";

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

	const finishedTasks = useMemo(
		() =>
			tasks
				.filter((task) => task.done)
				.sort((a, b) => b.finishedAt - a.finishedAt),
		[tasks],
	);
	// Ticks so tasks move to Missed as their deadlines pass.
	const [now, setNow] = useState(() => Date.now());
	const activeTasks = tasks.filter(
		(task) => taskStatus(task, now) === "active",
	);
	const missedTasks = tasks.filter(
		(task) => taskStatus(task, now) === "missed",
	);

	const { startIndex, endIndex, currentBatch, batchCount, onBatchChange } =
		usePagination(finishedTasks.length, 20);

	const paginationFinishedTasks = useMemo(
		() => finishedTasks.slice(startIndex, endIndex),
		[finishedTasks, startIndex, endIndex],
	);

	useEffect(() => {
		const interval = setInterval(() => {
			setNow(Date.now());
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
			<div className="mx-auto flex w-full max-w-3xl grow flex-col">
				{tasks.length > 0 ? (
					<div className="flex h-8 w-full shrink-0 items-center justify-between">
						<span
							className={`text-xs font-medium ${
								theme === LTHEME.DARK
									? "text-neutral-400"
									: "text-neutral-500"
							}`}
						>
							{tasks.length} task{tasks.length === 1 ? "" : "s"}
						</span>
					</div>
				) : null}
				{missedTasks.length > 0 ? (
					<LUIGroup title="Missed">
						{missedTasks.map((task) => (
							<LUITaskMini
								links={links}
								reminders={reminders}
								saves={saves}
								key={task.id}
								task={task}
								activeTag={activeTag}
								onSelectTag={onSelectTag}
							/>
						))}
					</LUIGroup>
				) : null}
				{activeTasks.length > 0 ? (
					<LUIGroup title="Active">
						{activeTasks.map((task) => (
							<LUITaskMini
								links={links}
								reminders={reminders}
								saves={saves}
								key={task.id}
								task={task}
								activeTag={activeTag}
								onSelectTag={onSelectTag}
							/>
						))}
					</LUIGroup>
				) : null}
				{finishedTasks.length > 0 ? (
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
								activeTag={activeTag}
								onSelectTag={onSelectTag}
							/>
						))}
					</LUIGroup>
				) : null}
				{tasks.length === 0 ? (
					<LUIEmptyState title="No tasks yet?" hint="Tap New task." />
				) : null}
			</div>
		</motion.div>
	);
};

export { Component as LUITasks };
