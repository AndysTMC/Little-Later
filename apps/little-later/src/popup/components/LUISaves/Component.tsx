import { motion } from "framer-motion";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { LUISaveMini } from "../LUISaveMini/Component";
import { LLink, LNote, LReminder, LTask, LVisualBM } from "little-shared/types";
import { useMemo } from "react";
import { usePagination } from "../../hooks/usePagination";
import { LUIPagination } from "../LUIPagination/Component";
import { LDateUtl } from "little-shared/utils/datetime";

const Component = ({
	className,
	links,
	notes,
	reminders,
	saves,
	tasks,
}: {
	className?: string;
	links: Array<LLink>;
	notes: Array<LNote>;
	reminders: Array<LReminder>;
	saves: Array<LVisualBM>;
	tasks: Array<LTask>;
}) => {
	const { theme } = useTheme();

	const { startIndex, endIndex, batchCount, currentBatch, onBatchChange } =
		usePagination(saves.length, 5);

	const paginationSaves = useMemo(() => {
		saves.sort((a, b) =>
			LDateUtl.compare(b.lastBrowseDate, a.lastBrowseDate),
		);
		return saves.slice(startIndex, endIndex) || [];
	}, [saves, startIndex, endIndex]);

	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-hidden`,
				className,
			)}
		>
			{paginationSaves.length > 0 ? (
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
						{paginationSaves.map((save) => (
							<LUISaveMini
								key={save.id}
								links={links}
								notes={notes}
								reminders={reminders}
								tasks={tasks}
								save={save}
							/>
						))}
						<span className="h-2 w-full" />
					</div>
				</div>
			) : (
				<div
					className={`flex w-full grow flex-col items-center justify-center py-8 ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
				>
					<div
						className={`text-5xl font-extrabold text-pretty opacity-10`}
					>
						Seems less?
					</div>
					<div
						className={`text-center text-5xl font-extrabold text-pretty opacity-10`}
					>
						Way to History!
					</div>
				</div>
			)}
		</motion.div>
	);
};

export { Component as LUISaves };
