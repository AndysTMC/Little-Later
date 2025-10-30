import { LLink, LNote, LReminder, LTask, LVisualBM } from "little-shared/types";
import { LINT_BOOLEAN, LLINK_TYPE, LTHEME } from "little-shared/enums";
import { ArrowSquareRightIcon } from "@phosphor-icons/react";
import { useContext, useEffect, useState } from "react";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import Markdown from "react-markdown";
import { twMerge } from "tailwind-merge";
import { getDomainFromUrl } from "little-shared/utils/misc";
import { LUIWebPreview } from "../LUIWebPreview/Component";
import { LReminderIcon, LTaskIcon } from "../LUIIcons";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LUIGroup } from "../LUIGroup/Component";
import { LUILink } from "../LUILink/Component";
import { HomeContext } from "../../contexts/Home";
import { useTheme } from "../../hooks/useTheme";
import { useLazyVBMImage } from "../../hooks/useLazyVBMImage";
import { useNavigate } from "react-router";
import { updateVisualBM } from "../../../services/visualBM";

const Component = ({
	className,
	links,
	notes,
	reminders,
	tasks,
	save,
	disableNavs = false,
}: {
	className?: string;
	links: Array<LLink>;
	notes: Array<LNote>;
	reminders: Array<LReminder>;
	tasks: Array<LTask>;
	save: LVisualBM;
	disableNavs?: boolean;
}) => {
	const { theme } = useTheme();
	const navigate = useNavigate();
	const { setHomeNavigation, setHomeSubNavigation, setShouldHomeNavigate } =
		useContext(HomeContext);
	const [isExpanded, setIsExpanded] = useState(false);
	const linkedTasks = links
		.filter((x) => x.type === LLINK_TYPE.TASK_VBM)
		.filter((x) => x.vbmId === save.id)
		.map((x) => tasks.find((y) => y.id === x.taskId))
		.filter((x) => x !== undefined);
	const linkedReminders = links
		.filter((x) => x.type === LLINK_TYPE.REMINDER_VBM)
		.filter((x) => x.vbmId === save.id)
		.map((x) => reminders.find((y) => y.id === x.reminderId))
		.filter((x) => x !== undefined);
	const linkedNotes = links
		.filter((x) => x.type === LLINK_TYPE.NOTE_VBM)
		.filter((x) => x.vbmId === save.id)
		.map((x) => notes.find((y) => y.id === x.noteId))
		.filter((x) => x !== undefined);

	const handleExpand = () => {
		setIsExpanded(!isExpanded);
	};
	const handleDelete = async () => {
		await updateVisualBM(save.url, {
			isSaved: LINT_BOOLEAN.FALSE,
		});
	};
	const handleEdit = () => {
		if (disableNavs) return;
		setHomeSubNavigation({
			exit: exitTransitions.none,
		});
		setHomeNavigation({
			exit: exitTransitions.slideLeft,
			navigateTo: "/save/" + save.id,
			navigateOptions: {
				state: { entryTransition: entryTransitions.slideLeft },
			},
		});
		setShouldHomeNavigate(true);
	};

	const { preview, elementRef } = useLazyVBMImage(save.id);

	useEffect(() => {
		if (save.hasBrowsed) {
			navigate("/home", {
				state: { entryTransition: entryTransitions.fade },
			});
		}
	}, [navigate, save]);

	return (
		<div ref={elementRef} className={twMerge(`h-max w-full`, className)}>
			<div
				className={`flex h-max w-full gap-x-2.5 ${!isExpanded ? "" : theme === LTHEME.DARK ? "bg-neutral-900" : "bg-neutral-100"} ${isExpanded ? "border border-neutral-500 px-4 py-2" : ""} rounded-lg transition-all duration-200`}
			>
				{!isExpanded ? (
					<LUIWebPreview
						previewBlob={preview?.blob}
						url={save.url}
						scaleType="short"
					/>
				) : null}

				<div
					className={`flex h-auto w-full grow flex-col ${isExpanded ? "" : "group cursor-pointer duration-100"} relative transition-all ${
						isExpanded
							? ""
							: theme === LTHEME.DARK
								? "active:bg-neutral-800"
								: "active:bg-neutral-200"
					} `}
					onClick={!isExpanded ? handleExpand : undefined}
				>
					<div
						className={`h-max w-full shrink-0 text-base font-semibold ${
							theme === LTHEME.DARK
								? "text-neutral-100"
								: "text-neutral-900"
						} line-clamp-2 leading-snug text-pretty break-all text-ellipsis`}
					>
						{save.customName}
					</div>
					<div
						className={`h-max w-full shrink-0 text-xs font-normal opacity-90 ${
							theme === LTHEME.DARK
								? "text-neutral-200"
								: "text-neutral-800"
						} `}
					>
						{getDomainFromUrl(save.url)}
					</div>
					{!isExpanded ? (
						<div
							className={`group flex w-full grow items-end justify-start gap-x-2 opacity-80`}
						>
							<div
								className={`flex h-max w-max items-end justify-center gap-x-0.5 ${linkedTasks.length === 0 ? "hidden" : ""} `}
							>
								<div
									className={`text-sm leading-none font-semibold ${
										theme === LTHEME.DARK
											? "text-white"
											: "text-black"
									} `}
								>
									{linkedTasks.length}
								</div>
								<LUIThemedIcon
									Icon={LTaskIcon}
									color={
										theme === LTHEME.DARK
											? "white"
											: "black"
									}
									weight="fill"
									className="size-4 transition-all"
								/>
							</div>
							<div
								className={`flex h-max w-max items-end justify-center gap-x-0.5 ${linkedReminders.length === 0 ? "hidden" : ""} `}
							>
								<div
									className={`text-sm leading-none font-semibold ${
										theme === LTHEME.DARK
											? "text-white"
											: "text-black"
									} `}
								>
									{linkedReminders.length}
								</div>
								<LUIThemedIcon
									Icon={LReminderIcon}
									color={
										theme === LTHEME.DARK
											? "white"
											: "black"
									}
									weight="fill"
									className="size-4 transition-all"
								/>
							</div>
						</div>
					) : null}
					{isExpanded && linkedTasks.length > 0 ? (
						<LUIGroup
							title={linkedTasks.length + " Task(s)"}
							headerTextSize="sm"
						>
							{linkedTasks.map((task) => (
								<LUILink
									key={task!.id}
									content={task!.information}
									navigateTo={"/task/" + task!.id}
									hoverBackground={
										theme === LTHEME.DARK
											? "bg-neutral-800"
											: "bg-neutral-200"
									}
									disableNavs={disableNavs}
								/>
							))}
						</LUIGroup>
					) : null}
					{isExpanded && linkedReminders.length > 0 ? (
						<LUIGroup
							title={linkedReminders.length + " Reminder(s)"}
							headerTextSize="sm"
						>
							{linkedReminders.map((reminder) => (
								<LUILink
									key={reminder!.id}
									content={reminder!.message}
									navigateTo={"/reminder/" + reminder!.id}
									hoverBackground={
										theme === LTHEME.DARK
											? "bg-neutral-800"
											: "bg-neutral-200"
									}
									disableNavs={disableNavs}
								/>
							))}
						</LUIGroup>
					) : null}
					{isExpanded && linkedNotes.length > 0 ? (
						<LUIGroup title="Notes" headerTextSize="sm">
							{linkedNotes.map((note, index) => (
								<div
									key={index}
									className={`h-max w-full border text-xs ${
										theme === LTHEME.DARK
											? "border-neutral-600 text-neutral-300"
											: "border-neutral-400 text-neutral-700"
									} my-0.5 rounded-lg p-2`}
								>
									<Markdown>{note!.content}</Markdown>
								</div>
							))}
						</LUIGroup>
					) : null}
					{!isExpanded ? (
						<div
							className={`absolute right-0 bottom-0 flex h-max w-max items-center justify-end overflow-hidden opacity-0 transition-all duration-300 group-hover:opacity-100`}
						>
							<div
								className={`h-max text-xs leading-none ${
									theme === LTHEME.DARK
										? "border-neutral-700 text-neutral-300"
										: "border-neutral-300 text-neutral-700"
								} rounded-t-sm border-x border-t px-2 py-1`}
							>
								Expand
							</div>
						</div>
					) : null}
					{isExpanded ? (
						<LUIWebPreview
							previewBlob={preview?.blob}
							url={save.url}
						/>
					) : null}
					{isExpanded ? (
						<div
							className={`max-h flex w-full justify-end gap-x-1`}
						>
							<div
								className={`h-max w-max text-xs ${theme === LTHEME.DARK ? "bg-white text-black" : "bg-black text-white"} cursor-pointer rounded-full px-2 py-1 active:scale-95`}
								onClick={handleDelete}
							>
								Delete
							</div>
							<div
								className={`h-max w-max text-xs ${theme === LTHEME.DARK ? "bg-white text-black" : "bg-black text-white"} cursor-pointer rounded-full px-2 py-1 active:scale-95`}
								onClick={handleExpand}
							>
								Collapse
							</div>
						</div>
					) : null}
				</div>
				{isExpanded && !disableNavs ? (
					<div
						className={`flex h-20 w-max shrink-0 items-center justify-center`}
					>
						<div
							className={`h-max w-max cursor-pointer opacity-15 transition-all duration-100 hover:opacity-100`}
							onClick={handleEdit}
						>
							<LUIThemedIcon
								Icon={ArrowSquareRightIcon}
								color={
									theme === LTHEME.DARK ? "white" : "black"
								}
								weight="fill"
								className="size-12"
							/>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
};

export { Component as LUISaveMini };
