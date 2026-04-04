import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { LUIUnlinker } from "../LUIUnlinker/Component";
import { LTask } from "little-shared/types";

const Component = ({
	className,
	tasks,
	linkedTaskIds,
	handleUnlinkTask,
}: {
	className?: string;
	tasks: Array<LTask>;
	linkedTaskIds: number[];
	handleUnlinkTask: (id: number, flag: boolean) => void;
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
			<div
				className={`flex h-max w-full items-center justify-start gap-x-1`}
			>
				<div
					className={`rounded-full border font-semibold ${
						theme === LTHEME.DARK
							? "border-white text-white"
							: "border-black text-black"
					} px-5`}
				>
					Tasks
				</div>
			</div>
			<div className={`flex max-h-56 w-full flex-col`}>
				{linkedTasks.map((task, index) => (
					<LUIUnlinker
						key={index}
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
