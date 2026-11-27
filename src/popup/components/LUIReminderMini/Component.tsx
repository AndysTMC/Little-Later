import { capitalize } from "little-shared/utils/misc";
import { LTHEME } from "little-shared/enums";
import { CaretDownIcon, NotePencilIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LReminderIcon } from "../LUIIcons";
import { LUIGroup } from "../LUIGroup/Component";
import { LUILink } from "../LUILink/Component";
import { useTheme } from "../../hooks/useTheme";
import type { Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { linkedFrom, reminderKind } from "../../records";
import { prettyDate } from "../../../utils/dates";
import { send } from "../../../utils/send";
import { LUIDeleteButton } from "../LUIDeleteButton/Component";
import { LUIBadge } from "../LUIBadge/Component";
import { LUIPillButton } from "../LUIPillButton/Component";
import { LUITagChips } from "../LUITagChips/Component";
import { LUITooltip } from "../LUITooltip/Component";
import { MOTION } from "../../../route-transitions";

const Component = ({
	className,
	links,
	saves,
	tasks,
	reminder,
	disableNavs,
	activeTag = null,
	onSelectTag,
}: {
	className?: string;
	links: Array<LinkRow>;
	saves: Array<Save>;
	tasks: Array<Task>;
	reminder: Reminder;
	disableNavs?: boolean;
	activeTag?: string | null;
	onSelectTag?: (tag: string) => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const go = useMoveNavigate();
	const [showDetails, setShowDetails] = useState(false);
	const linkedSaves = linkedFrom(links, reminder.id, saves);
	// A task's own reminder is changed and removed through the task.
	const [linkedTask] = linkedFrom(links, reminder.id, tasks);
	const kind = reminderKind(reminder);
	// Escalating reminders fire ahead of their target; 0 once done.
	const nextFire =
		kind === "escalating" && reminder.nextFireAt !== 0
			? reminder.nextFireAt
			: 0;
	const handleEdit = () => {
		if (disableNavs) return;
		go("/reminder/" + reminder.id, "forward");
	};
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
			<div className="flex w-full items-start gap-x-3 p-3">
				<div
					aria-hidden
					className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl ${
						isDark
							? "bg-neutral-800 text-neutral-200"
							: "bg-neutral-200 text-neutral-800"
					}`}
				>
					<LUIThemedIcon
						Icon={LReminderIcon}
						color="currentColor"
						weight={kind === "escalating" ? "fill" : "regular"}
						className="size-4"
					/>
				</div>

				<div className="flex min-w-0 grow flex-col gap-y-1.5">
					<button
						type="button"
						aria-expanded={showDetails}
						onClick={() => setShowDetails((open) => !open)}
						className="flex w-full min-w-0 cursor-pointer flex-col gap-y-1 text-left"
					>
						<div
							className={`text-sm leading-snug font-medium text-pretty ${
								showDetails ? "" : "line-clamp-2"
							} ${isDark ? "text-neutral-100" : "text-neutral-900"}`}
						>
							{reminder.message}
						</div>
						<div className="flex flex-wrap items-center gap-1.5">
							<span
								className={`text-xs font-medium ${
									isDark
										? "text-neutral-300"
										: "text-neutral-700"
								}`}
							>
								{prettyDate(reminder.target)}
							</span>
							<LUIBadge
								tone={
									kind === "escalating" ? "accent" : "neutral"
								}
							>
								{capitalize(kind)}
							</LUIBadge>
							{nextFire ? (
								<span
									className={`text-xs ${
										isDark
											? "text-neutral-400"
											: "text-neutral-600"
									}`}
								>
									Next {prettyDate(nextFire)}
								</span>
							) : null}
						</div>
					</button>
					{(reminder.tags?.length ?? 0) > 0 ? (
						<LUITagChips
							tags={reminder.tags ?? []}
							activeTag={activeTag}
							onSelect={onSelectTag}
						/>
					) : null}
				</div>

				<div className="flex shrink-0 items-center gap-x-0.5">
					{!disableNavs && !showDetails ? (
						<LUITooltip
							content={
								linkedTask
									? "Edit this reminder on its task"
									: "Edit reminder"
							}
							placement="top"
						>
							<button
								className={`flex size-8 cursor-pointer items-center justify-center rounded-lg transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
									isDark
										? "text-neutral-400 hover:bg-neutral-800 hover:text-white"
										: "text-neutral-500 hover:bg-neutral-200 hover:text-black"
								}`}
								type="button"
								aria-label={
									linkedTask
										? "Edit this reminder on its task"
										: "Edit reminder"
								}
								onClick={handleEdit}
								disabled={linkedTask !== undefined}
							>
								<LUIThemedIcon
									Icon={NotePencilIcon}
									color="currentColor"
									weight="regular"
									className="size-4"
								/>
							</button>
						</LUITooltip>
					) : null}
					<button
						type="button"
						aria-label="Details"
						aria-expanded={showDetails}
						onClick={() => setShowDetails((open) => !open)}
						className={`flex size-6 cursor-pointer items-center justify-center rounded-lg transition-colors ${
							isDark
								? "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
								: "text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
						}`}
					>
						<LUIThemedIcon
							Icon={CaretDownIcon}
							color="currentColor"
							weight="regular"
							className={`size-3.5 transition-transform duration-150 ${showDetails ? "rotate-180" : ""}`}
						/>
					</button>
				</div>
			</div>

			<AnimatePresence initial={false}>
				{showDetails ? (
					<motion.div
						className="overflow-hidden"
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={MOTION.drawer}
					>
						<div
							className={`flex flex-col gap-y-2.5 border-t px-3 pt-2.5 pb-3 ${
								isDark
									? "border-neutral-800"
									: "border-neutral-200"
							}`}
						>
							{linkedTask ? (
								<p
									className={`text-xs ${
										isDark
											? "text-neutral-400"
											: "text-neutral-600"
									}`}
								>
									Managed by its task. Edit or remove it on
									the task.
								</p>
							) : null}
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
							<div className="flex w-full flex-wrap items-center justify-between gap-2">
								<div className="flex items-center gap-1.5">
									{!disableNavs ? (
										<LUIPillButton
											label="Edit"
											ariaLabel={
												linkedTask
													? "Edit this reminder on its task"
													: "Edit reminder"
											}
											disabled={linkedTask !== undefined}
											onClick={handleEdit}
										/>
									) : null}
								</div>
								<div className="flex items-center gap-1.5">
									<LUIDeleteButton
										onDelete={() =>
											send("reminder.delete", {
												id: reminder.id,
											})
										}
										failureMessage="Couldn't delete this reminder."
										disabled={linkedTask !== undefined}
									/>
									<LUIPillButton
										label="Collapse"
										onClick={() => setShowDetails(false)}
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

export { Component as LUIReminderMini };
