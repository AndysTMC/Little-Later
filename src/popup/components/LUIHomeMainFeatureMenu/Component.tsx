import { LTHEME, LHOME_MAIN_CONTENT } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LUITooltip } from "../LUITooltip/Component";
import { twMerge } from "tailwind-merge";
import { LVBMIcon, LTaskIcon, LReminderIcon } from "../LUIIcons";
import { ImageIcon, NotebookIcon } from "@phosphor-icons/react";

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
	const isDark = theme === LTHEME.DARK;

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
		{
			content: LHOME_MAIN_CONTENT.IMAGES,
			label: "Images",
			icon: ImageIcon,
		},
	];

	return (
		<div
			className={twMerge(
				`flex h-max w-full items-center justify-center px-4 py-1`,
				className,
			)}
		>
			<div
				role="tablist"
				aria-label="Home features"
				className={`flex h-9 w-full items-center gap-x-1 rounded-xl border p-1 ${
					isDark
						? "border-neutral-800 bg-neutral-900"
						: "border-neutral-200 bg-neutral-100"
				}`}
			>
				{tabs.map((tab) => {
					const isActive = currentContent === tab.content;
					return (
						<LUITooltip
							key={tab.content}
							content={tab.label}
							placement="bottom"
							disabled={isActive}
							triggerClassName="h-full shrink-0"
							triggerRole="none"
						>
							<button
								type="button"
								role="tab"
								aria-selected={isActive}
								aria-label={tab.label}
								className={`flex h-full cursor-pointer items-center justify-center gap-x-1.5 rounded-lg transition-all duration-150 active:scale-95 ${
									isActive
										? "ll-accent-fill min-w-0 grow px-2.5 min-[380px]:px-3"
										: `w-9 shrink-0 min-[380px]:w-12 ${
												isDark
													? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
													: "text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
											}`
								}`}
								onClick={() => handleContentChange(tab.content)}
							>
								<LUIThemedIcon
									Icon={tab.icon}
									weight={isActive ? "fill" : "regular"}
									color="currentColor"
									className="size-4 shrink-0"
								/>
								{isActive ? (
									<span className="truncate text-sm font-semibold whitespace-nowrap">
										{tab.label}
									</span>
								) : null}
							</button>
						</LUITooltip>
					);
				})}
			</div>
		</div>
	);
};

export { Component as LUIHomeMainFeatureMenu };
