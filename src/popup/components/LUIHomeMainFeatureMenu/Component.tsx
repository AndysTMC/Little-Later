import { LTHEME, LHOME_MAIN_CONTENT } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { twMerge } from "tailwind-merge";
import { LVBMIcon, LTaskIcon, LReminderIcon } from "../LUIIcons";
import { NotebookIcon } from "@phosphor-icons/react";

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

	const tabs = [
		{
			content: LHOME_MAIN_CONTENT.SAVES,
			label: "Saves",
			icon: LVBMIcon,
		},
		{
			content: LHOME_MAIN_CONTENT.TASKS,
			label: "Tasks",
			icon: LTaskIcon,
		},
		{
			content: LHOME_MAIN_CONTENT.REMINDERS,
			label: "Reminders",
			icon: LReminderIcon,
		},
		{
			content: LHOME_MAIN_CONTENT.NOTES,
			label: "Notes",
			icon: NotebookIcon,
		},
	];

	return (
		<div
			className={twMerge(
				`flex h-max w-full items-center justify-center py-1`,
				className,
			)}
		>
			<div
				className={`flex h-8 w-4/5 overflow-hidden rounded-full border ${
					theme === LTHEME.DARK
						? "border-neutral-800"
						: "border-neutral-200"
				}`}
			>
				{tabs.map((tab) => {
					const isActive = currentContent === tab.content;
					return (
						<div
							key={tab.content}
							className={`flex h-full cursor-pointer items-center justify-center gap-x-1 transition-colors duration-300 ${
								isActive ? "min-w-0 grow px-4" : "w-14 shrink-0"
							} ${
								isActive
									? theme === LTHEME.DARK
										? "bg-white text-black"
										: "bg-black text-white"
									: theme === LTHEME.DARK
										? "bg-black text-white hover:bg-neutral-800"
										: "bg-white text-black hover:bg-neutral-200"
							}`}
							onClick={() => handleContentChange(tab.content)}
						>
							<LUIThemedIcon
								Icon={tab.icon}
								weight="fill"
								className="size-5"
								invertTheme={isActive}
							/>
							{isActive ? (
								<span className="text-md truncate font-bold whitespace-nowrap">
									{tab.label}
								</span>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
};

export { Component as LUIHomeMainFeatureMenu };

