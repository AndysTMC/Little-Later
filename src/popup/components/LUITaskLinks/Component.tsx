import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { LUIUnlinker } from "../LUIUnlinker/Component";
import type { Task } from "../../../storage/repositories";

const Component = ({
	className,
	tasks,
	linkedTaskIds,
	handleUnlinkTask,
}: {
	className?: string;
	tasks: Array<Task>;
	linkedTaskIds: Array<string>;
	handleUnlinkTask: (id: string) => void;
}) => {
	const { theme } = useTheme();
	const linkedTasks = tasks.filter((x) => linkedTaskIds.includes(x.id));
	return (
		<div
			className={twMerge(
				`my-1 flex h-max w-full flex-col gap-y-1`,
				className,
			)}
		>
			<div className="flex h-max w-full items-center justify-start">
				<span
					className={`text-xs font-medium ${
						theme === LTHEME.DARK
							? "text-neutral-400"
							: "text-neutral-600"
					}`}
				>
					Tasks
				</span>
			</div>
			<div
				className={`flex max-h-56 w-full flex-col gap-y-1 overflow-y-auto ${theme}-scrollbar`}
			>
				{linkedTasks.map((task) => (
					<LUIUnlinker
						key={task.id}
						content={task.information}
						id={task.id}
						handleUnlink={handleUnlinkTask}
					/>
				))}
			</div>
		</div>
	);
};

export { Component as LUITaskLinks };
