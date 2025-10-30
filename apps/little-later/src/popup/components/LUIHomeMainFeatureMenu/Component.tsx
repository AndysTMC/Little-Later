import { LTHEME, LHOME_MAIN_CONTENT } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { twMerge } from "tailwind-merge";
import { LSaveIcon, LTaskIcon, LReminderIcon } from "../LUIIcons";

const Component = ({
	className,
	currentContent,
	handleContentChange,
}: {
	className?: string;
	currentContent: LHOME_MAIN_CONTENT;
	handleContentChange: (content: LHOME_MAIN_CONTENT) => void;
}) => {
	const { theme } = useTheme();

	return (
		<div
			className={twMerge(
				`flex h-max w-full items-center justify-center py-1`,
				className,
			)}
		>
			<div
				className={`h-7 w-4/5 ${
					theme === LTHEME.DARK
						? "border border-neutral-800"
						: "border border-neutral-200"
				} grid grid-cols-10 overflow-hidden rounded-full transition-all duration-50`}
			>
				<div
					className={` ${
						currentContent === LHOME_MAIN_CONTENT.SAVES
							? "col-span-4 font-bold"
							: "col-span-3 text-sm"
					} ${
						currentContent === LHOME_MAIN_CONTENT.SAVES
							? theme === LTHEME.DARK
								? "bg-white text-black"
								: "bg-black text-white"
							: theme === LTHEME.DARK
								? "bg-black text-white hover:bg-neutral-800"
								: "bg-white text-black hover:bg-neutral-200"
					} flex cursor-pointer items-center justify-center gap-x-2 rounded-l-full transition-colors duration-300`}
					onClick={() =>
						handleContentChange(LHOME_MAIN_CONTENT.SAVES)
					}
				>
					{currentContent === LHOME_MAIN_CONTENT.SAVES ? (
						<LUIThemedIcon
							Icon={LSaveIcon}
							weight="fill"
							className="size-5"
							invertTheme
						/>
					) : null}
					<span>Saves</span>
				</div>
				<div
					className={` ${
						currentContent === LHOME_MAIN_CONTENT.TASKS
							? "col-span-4 font-bold"
							: "col-span-3 text-sm"
					} ${
						currentContent === LHOME_MAIN_CONTENT.TASKS
							? theme === LTHEME.DARK
								? "bg-white text-black"
								: "bg-black text-white"
							: theme === LTHEME.DARK
								? "bg-black text-white hover:bg-neutral-800"
								: "bg-white text-black hover:bg-neutral-200"
					} flex cursor-pointer items-center justify-center gap-x-2 transition-colors duration-300`}
					onClick={() =>
						handleContentChange(LHOME_MAIN_CONTENT.TASKS)
					}
				>
					{currentContent === LHOME_MAIN_CONTENT.TASKS ? (
						<LUIThemedIcon
							Icon={LTaskIcon}
							weight="fill"
							className="size-5"
							invertTheme
						/>
					) : null}
					<span>Tasks</span>
				</div>
				<div
					className={` ${
						currentContent === LHOME_MAIN_CONTENT.REMINDERS
							? "col-span-4 font-bold"
							: "col-span-3 text-sm"
					} ${
						currentContent === LHOME_MAIN_CONTENT.REMINDERS
							? theme === LTHEME.DARK
								? "bg-white text-black"
								: "bg-black text-white"
							: theme === LTHEME.DARK
								? "bg-black text-white hover:bg-neutral-800"
								: "bg-white text-black hover:bg-neutral-200"
					} flex cursor-pointer items-center justify-center gap-x-2 rounded-r-full transition-colors duration-300`}
					onClick={() =>
						handleContentChange(LHOME_MAIN_CONTENT.REMINDERS)
					}
				>
					{currentContent === LHOME_MAIN_CONTENT.REMINDERS ? (
						<LUIThemedIcon
							Icon={LReminderIcon}
							weight="fill"
							className="size-5"
							invertTheme
						/>
					) : null}
					<span>Reminders</span>
				</div>
			</div>
		</div>
	);
};

export { Component as LUIHomeMainFeatureMenu };
