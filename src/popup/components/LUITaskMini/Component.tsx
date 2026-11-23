import { LTHEME } from "little-shared/enums";
import { useRef, useState } from "react";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { capitalize } from "little-shared/utils/misc";
import { pressable } from "../../a11y";
import { attempt } from "../../attempt";
import { LUIDeleteButton } from "../LUIDeleteButton/Component";
import { LUIPillButton } from "../LUIPillButton/Component";
import { LUITagChips } from "../LUITagChips/Component";
import { useTheme } from "../../hooks/useTheme";
import {
	CaretDownIcon,
	CheckIcon,
	NotePencilIcon,
} from "@phosphor-icons/react";
import { LVBMIcon, LReminderIcon } from "../LUIIcons";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LUIGroup } from "../LUIGroup/Component";
import { LUILink } from "../LUILink/Component";
import type { Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { linkedFrom, linkedTo, reminderKind } from "../../records";
import { prettyDate, prettyRule } from "../../../utils/dates";
import { send } from "../../../utils/send";

const Component = ({
	className,
	links,
	reminders,
	saves,
	task,
	disableNavs = false,
	activeTag = null,
	onSelectTag,
}: {
	className?: string;
	links: Array<LinkRow>;
	reminders: Array<Reminder>;
	saves: Array<Save>;
	task: Task;
	disableNavs?: boolean;
	activeTag?: string | null;
	onSelectTag?: (tag: string) => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const go = useMoveNavigate();
	const linkedSaves = linkedFrom(links, task.id, saves);
	const [linkedReminder] = linkedTo(links, task.id, reminders);
	const linkedReminderKind = linkedReminder
		? reminderKind(linkedReminder)
		: undefined;
	const [isExpanded, setIsExpanded] = useState(false);

	const handleExpand = () => {
		setIsExpanded((open) => !open);
	};

	const handleEdit = () => {
		if (disableNavs) return;
		go("/task/" + task.id, "forward");
	};

	const markingRef = useRef(false);
	const handleMark = async () => {
		if (markingRef.current) return;
		markingRef.current = true;
		try {
			// A recurring task never stays done: completing moves it on.
			await attempt(
				() =>
					send(task.done ? "task.reopen" : "task.complete", {
						id: task.id,
					}),
				"Couldn't update this task.",
			);
		} finally {
			markingRef.current = false;
		}
	};

	const scheduleSummary =
		task.schedule.kind === "due"
			? `Due ${prettyDate(task.schedule.at)}`
			: task.schedule.kind === "recurring"
				? `${prettyRule(task.schedule.rule)} · ${prettyDate(task.dueAt)}`
				: null;
	const taskTags = task.tags ?? [];
	const showLegacyLabel = task.label !== "" && taskTags.length === 0;
	const showPriority = task.priority !== "medium";
	const hasMeta =
		showLegacyLabel ||
		showPriority ||
		scheduleSummary !== null ||
		linkedSaves.length > 0 ||
		linkedReminderKind !== undefined;
	const hasSubRow = hasMeta || taskTags.length > 0;

	return (
		<div
			className={twMerge(
				`flex h-max w-full shrink-0 flex-col rounded-2xl border transition-colors ${
					isDark
						? "border-neutral-800 bg-neutral-900/70 hover:border-neutral-700"
						: "border-neutral-200 bg-neutral-100/70 hover:border-neutral-300"
				}`,
				className,
			)}
		>
			<div
				className={`flex w-full gap-x-3 p-3 ${
					hasSubRow ? "items-start" : "items-center"
				}`}
			>
				<button
					type="button"
					aria-label={
						task.done
							? "Mark task as unfinished"
							: "Mark task as finished"
					}
					className={`${hasSubRow ? "mt-0.5" : ""} flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-all active:scale-90 ${
						task.done
							? "ll-accent-fill border-transparent"
							: isDark
								? "border-neutral-600 bg-transparent hover:border-[var(--ll-accent)]"
								: "border-neutral-400 bg-transparent hover:border-[var(--ll-accent)]"
					}`}
					onClick={(event) => {
						event.stopPropagation();
						void handleMark();
					}}
				>
					{task.done ? (
						<LUIThemedIcon
							Icon={CheckIcon}
							color="currentColor"
							weight="bold"
							className="size-3"
						/>
					) : null}
				</button>

				<div
					className="flex min-w-0 grow cursor-pointer flex-col gap-y-1.5"
					aria-expanded={isExpanded}
					{...pressable(handleExpand)}
				>
					<div
						className={`text-sm leading-snug font-medium text-pretty ${
							isExpanded ? "" : "line-clamp-2"
						} ${
							task.done
								? isDark
									? "text-neutral-500 line-through"
									: "text-neutral-400 line-through"
								: isDark
									? "text-neutral-100"
									: "text-neutral-900"
						}`}
					>
						{task.information}
					</div>

					{hasMeta ? (
						<div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
							{showPriority ? (
								<span
									className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
										task.priority === "high"
											? "ll-accent-fill"
											: isDark
												? "bg-neutral-800 text-neutral-400"
												: "bg-neutral-200 text-neutral-600"
									}`}
								>
									{capitalize(task.priority)}
								</span>
							) : null}
							{showLegacyLabel ? (
								<span
									className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
										isDark
											? "bg-neutral-800 text-neutral-300"
											: "bg-neutral-200 text-neutral-700"
									}`}
								>
									{task.label}
								</span>
							) : null}
							{scheduleSummary ? (
								<span
									className={`text-xs ${
										isDark
											? "text-neutral-400"
											: "text-neutral-600"
									}`}
								>
									{scheduleSummary}
								</span>
							) : null}
							{linkedSaves.length > 0 ? (
								<span
									className={`inline-flex items-center gap-x-1 text-xs ${
										isDark
											? "text-neutral-400"
											: "text-neutral-600"
									}`}
								>
									<LUIThemedIcon
										Icon={LVBMIcon}
										color="currentColor"
										weight="regular"
										className="size-3.5"
									/>
									{linkedSaves.length}
								</span>
							) : null}
							{linkedReminderKind ? (
								<span
									className={`inline-flex items-center gap-x-1 text-xs ${
										isDark
											? "text-neutral-400"
											: "text-neutral-600"
									}`}
								>
									<LUIThemedIcon
										Icon={LReminderIcon}
										color="currentColor"
										weight="regular"
										className="size-3.5"
									/>
									{capitalize(linkedReminderKind)}
								</span>
							) : null}
						</div>
					) : null}
					{taskTags.length > 0 ? (
						<LUITagChips
							tags={taskTags}
							activeTag={activeTag}
							onSelect={onSelectTag}
						/>
					) : null}
				</div>

				<div className="flex shrink-0 items-center gap-x-0.5">
					{!isExpanded && !disableNavs ? (
						<button
							type="button"
							aria-label="Edit task"
							className={`flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors ${
								isDark
									? "text-neutral-400 hover:bg-neutral-800 hover:text-white"
									: "text-neutral-500 hover:bg-neutral-200 hover:text-black"
							}`}
							onClick={(event) => {
								event.stopPropagation();
								handleEdit();
							}}
						>
							<LUIThemedIcon
								Icon={NotePencilIcon}
								weight="regular"
								color="currentColor"
								className="size-4"
							/>
						</button>
					) : null}
					<span
						aria-hidden
						onClick={handleExpand}
						className={`flex size-6 cursor-pointer items-center justify-center ${
							isDark ? "text-neutral-500" : "text-neutral-400"
						}`}
					>
						<LUIThemedIcon
							Icon={CaretDownIcon}
							color="currentColor"
							weight="regular"
							className={`size-3.5 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
						/>
					</span>
				</div>
			</div>

			<AnimatePresence initial={false}>
				{isExpanded ? (
					<motion.div
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.16, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div
							className={`flex flex-col gap-y-2 border-t px-3 pt-2.5 pb-3 ${
								isDark
									? "border-neutral-800"
									: "border-neutral-200"
							}`}
						>
							{linkedSaves.length > 0 ? (
								<LUIGroup
									title={`${linkedSaves.length} Save${linkedSaves.length === 1 ? "" : "s"}`}
									headerTextSize="sm"
								>
									{linkedSaves.map((save) => (
										<LUILink
											key={save.id}
											content={save.customName}
											navigateTo={"/vbm/" + save.id}
											hoverBackground={
												isDark
													? "bg-neutral-800"
													: "bg-neutral-200"
											}
											disableNavs={disableNavs}
										/>
									))}
								</LUIGroup>
							) : null}

							<div className="flex w-full flex-wrap items-center gap-1.5">
								<LUIPillButton
									label={
										task.done
											? "Mark unfinished"
											: "Mark finished"
									}
									onClick={() => void handleMark()}
								/>
								{!disableNavs ? (
									<LUIPillButton
										label="Edit"
										ariaLabel="Edit task"
										onClick={handleEdit}
									/>
								) : null}
								<div className="flex grow justify-end gap-x-1.5">
									<LUIDeleteButton
										onDelete={() =>
											send("task.delete", {
												id: task.id,
											})
										}
										failureMessage="Couldn't delete this task."
									/>
									<LUIPillButton
										label="Collapse"
										onClick={handleExpand}
									/>
								</div>
							</div>
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
};

export { Component as LUITaskMini };
