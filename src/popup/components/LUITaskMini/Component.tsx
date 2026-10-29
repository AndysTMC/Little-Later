import { LTHEME } from "little-shared/enums";
import { useContext, useEffect, useState } from "react";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { fakeWait, capitalize } from "little-shared/utils/misc";
import { HomeContext } from "../../contexts/Home";
import { useTheme } from "../../hooks/useTheme";
import { FlagIcon, NotePencilIcon } from "@phosphor-icons/react";
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
}: {
	className?: string;
	links: Array<LinkRow>;
	reminders: Array<Reminder>;
	saves: Array<Save>;
	task: Task;
	disableNavs?: boolean;
}) => {
	const { theme } = useTheme();
	const { setHomeNavigation, setHomeSubNavigation, setShouldHomeNavigate } =
		useContext(HomeContext);
	const linkedSaves = linkedFrom(links, task.id, saves);
	const [linkedReminder] = linkedTo(links, task.id, reminders);
	const linkedReminderKind = linkedReminder
		? reminderKind(linkedReminder)
		: undefined;
	const [isExpanded, setIsExpanded] = useState(false);
	const [isEditHovered, setIsEditHovered] = useState(false);
	const [isVisible, setIsVisible] = useState(false);

	const handleExpand = () => {
		setIsExpanded(!isExpanded);
	};

	const handleDelete = async () => {
		await send("task.delete", { id: task.id });
	};

	const handleEdit = () => {
		if (disableNavs) return;
		setHomeSubNavigation({
			exit: exitTransitions.none,
		});
		setHomeNavigation({
			exit: exitTransitions.slideLeft,
			navigateTo: "/task/" + task.id,
			navigateOptions: {
				state: { entryTransition: entryTransitions.slideLeft },
			},
		});
		setShouldHomeNavigate(true);
	};

	const handleMark = async () => {
		setIsVisible(false);
		await fakeWait({ waitPeriod: 200 });
		// A recurring task never stays done: completing moves it on.
		await send(task.done ? "task.reopen" : "task.complete", {
			id: task.id,
		});
	};

	useEffect(() => {
		const loadAnimation = async () => {
			await fakeWait({ waitPeriod: 100 });
			setIsVisible(true);
		};
		loadAnimation();
	}, [setIsVisible]);

	return (
		<AnimatePresence>
			{isVisible ? (
				<motion.div
					className={twMerge(`my-1 h-max w-full shrink-0`, className)}
					initial={{ opacity: 0, scale: 0.7 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={{ opacity: 0, scale: 0.7 }}
					transition={{ duration: 0.2 }}
				>
					<div
						className={`flex h-max w-full gap-x-0.5 border ${
							theme === LTHEME.DARK
								? `bg-neutral-900`
								: `bg-neutral-100`
						} ${
							isExpanded
								? "rounded-2xl border-neutral-500 bg-transparent px-4 py-2 transition-colors duration-200"
								: "rounded-full border-transparent transition-all duration-200"
						} `}
					>
						{!isExpanded ? (
							<div
								className={`flex size-22 shrink-0 items-center justify-center`}
							>
								<button
									type="button"
									aria-label={
										task.done
											? "Mark task as unfinished"
											: "Mark task as finished"
									}
									className={`flex size-8 items-center justify-center border-1 border-neutral-500 ${
										theme === LTHEME.DARK
											? "hover:bg-neutral-700"
											: "hover:bg-neutral-300"
									} cursor-pointer rounded-full bg-transparent active:scale-95`}
									onClick={handleMark}
								>
									<LUIThemedIcon
										Icon={FlagIcon}
										weight={task.done ? "fill" : "regular"}
										className={`size-5`}
									/>
								</button>
							</div>
						) : null}

						<div
							className={`flex min-h-22 grow flex-col py-1 ${isExpanded ? "" : "cursor-pointer"} group relative`}
							onClick={!isExpanded ? handleExpand : undefined}
						>
							<div
								className={`line-clamp-2 h-max w-full text-sm leading-snug font-medium text-pretty text-ellipsis ${
									theme === LTHEME.DARK
										? "text-neutral-100"
										: "text-neutral-900"
								} `}
							>
								{task.information}
							</div>
							<div
								className={`flex h-max w-full items-center justify-start gap-x-1 ${isExpanded ? "flex-wrap" : ""} `}
							>
								<div
									className={`line-clamp-2 h-max w-max rounded-full border px-2 text-xs leading-snug font-medium text-pretty text-ellipsis ${
										theme === LTHEME.DARK
											? `border-white ${
													!isExpanded
														? "bg-neutral-100 text-neutral-900"
														: "text-neutral-100"
												} `
											: `border-black ${
													!isExpanded
														? "bg-neutral-900 text-neutral-100"
														: "text-neutral-900"
												} `
									} `}
								>
									{task.label}
								</div>
								{task.schedule.kind === "due" ? (
									<div
										className={`line-clamp-2 h-max w-max rounded-full border px-2 text-xs leading-snug font-medium text-pretty text-ellipsis ${
											theme === LTHEME.DARK
												? `border-white ${
														!isExpanded
															? "bg-neutral-100 text-neutral-900"
															: "text-neutral-100"
													} `
												: `border-black ${
														!isExpanded
															? "bg-neutral-900 text-neutral-100"
															: "text-neutral-900"
													} `
										} `}
									>
										{"Due" +
											(isExpanded
												? " by " +
													prettyDate(task.schedule.at)
												: "")}
									</div>
								) : null}
								{task.schedule.kind === "recurring" ? (
									<div
										className={`line-clamp-2 h-max w-max rounded-full border px-2 text-xs leading-snug font-medium text-pretty text-ellipsis ${
											theme === LTHEME.DARK
												? `border-white ${
														!isExpanded
															? "bg-neutral-100 text-neutral-900"
															: "text-neutral-100"
													} `
												: `border-black ${
														!isExpanded
															? "bg-neutral-900 text-neutral-100"
															: "text-neutral-900"
													} `
										} `}
									>
										{!isExpanded
											? "Recurring"
											: `${prettyRule(task.schedule.rule)}, next ${prettyDate(task.dueAt)}`}
									</div>
								) : null}
							</div>

							{!isExpanded ? (
								<div
									className={`my-1 flex w-full grow items-end justify-start gap-x-2 opacity-80`}
								>
									<div
										className={`flex h-max w-max items-end justify-center gap-x-0.5 ${linkedSaves.length === 0 ? "hidden" : ""} `}
									>
										<div
											className={`text-sm leading-none font-semibold ${
												theme === LTHEME.DARK
													? "text-neutral-100"
													: "text-neutral-900"
											} `}
										>
											{linkedSaves.length}
										</div>
										<LUIThemedIcon
											Icon={LVBMIcon}
											color={
												theme === LTHEME.DARK
													? "white"
													: "black"
											}
											weight="fill"
											className="size-4 transition-all"
										/>
									</div>
									{linkedReminderKind ? (
										<div
											className={`flex h-max w-max items-end justify-center gap-x-0.5`}
										>
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
											<div
												className={`text-sm leading-none font-semibold ${
													theme === LTHEME.DARK
														? "text-neutral-100"
														: "text-neutral-900"
												} `}
											>
												{!isExpanded
													? "(" +
														capitalize(
															linkedReminderKind,
														).slice(0, 1) +
														")"
													: capitalize(
															linkedReminderKind,
														)}
											</div>
										</div>
									) : null}
								</div>
							) : null}
							{isExpanded && linkedReminderKind ? (
								<div
									className={`mt-1 flex h-max w-max items-end justify-center gap-x-0.5`}
								>
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
									<div
										className={`text-sm leading-none font-semibold ${
											theme === LTHEME.DARK
												? "text-neutral-100"
												: "text-neutral-900"
										} `}
									>
										{!isExpanded
											? "(" +
												capitalize(
													linkedReminderKind,
												).slice(0, 1) +
												")"
											: capitalize(linkedReminderKind)}
									</div>
								</div>
							) : null}
							{isExpanded && linkedSaves.length > 0 ? (
								<LUIGroup
									title={linkedSaves.length + " Save(s)"}
									headerTextSize="sm"
								>
									{linkedSaves.map((save) => (
										<LUILink
											key={save.id}
											content={save.customName}
											navigateTo={"/vbm/" + save.id}
											hoverBackground={
												theme === LTHEME.DARK
													? "bg-neutral-900"
													: "bg-neutral-100"
											}
											disableNavs={disableNavs}
										/>
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
								<div
									className={`my-1 flex h-max w-full items-end justify-start gap-x-1`}
								>
									<div
										className={`h-7 w-max text-xs ${
											theme === LTHEME.DARK
												? "bg-white text-black"
												: "bg-black text-white"
										} cursor-pointer rounded-full px-10 py-1 active:scale-95`}
										onClick={handleMark}
									>
										<LUIThemedIcon
											Icon={FlagIcon}
											weight={
												task.done ? "fill" : "regular"
											}
											color={
												theme === LTHEME.DARK
													? "black"
													: "white"
											}
											className={`size-5`}
										/>
									</div>
									{!disableNavs ? (
										<div
											className={`flex h-7 w-max items-center justify-center text-sm ${
												theme === LTHEME.DARK
													? "bg-white text-black"
													: "bg-black text-white"
											} cursor-pointer rounded-full px-10 py-1 active:scale-95`}
											onClick={handleEdit}
										>
											<LUIThemedIcon
												Icon={NotePencilIcon}
												weight="regular"
												color={
													theme === LTHEME.DARK
														? "black"
														: "white"
												}
												className={`size-5`}
											/>
										</div>
									) : null}

									<div
										className={`flex h-max grow justify-end gap-x-1`}
									>
										<button
											className={`h-max w-max text-xs ${
												theme === LTHEME.DARK
													? "bg-white text-black"
													: "bg-black text-white"
											} cursor-pointer rounded-full px-2 py-1 active:scale-95`}
											onClick={handleDelete}
										>
											Delete
										</button>
										<button
											className={`h-max w-max text-xs ${
												theme === LTHEME.DARK
													? "bg-white text-black"
													: "bg-black text-white"
											} cursor-pointer rounded-full px-2 py-1 active:scale-95`}
											onClick={handleExpand}
										>
											Collapse
										</button>
									</div>
								</div>
							) : null}
						</div>

						{!isExpanded && !disableNavs ? (
							<div
								className={`flex size-22 shrink-0 cursor-pointer items-center justify-center rounded-full border ${
									theme === LTHEME.DARK
										? "border-neutral-100 hover:bg-neutral-100"
										: "border-neutral-900 hover:bg-neutral-900"
								}`}
								onClick={handleEdit}
								onMouseEnter={() => setIsEditHovered(true)}
								onMouseLeave={() => setIsEditHovered(false)}
							>
								<LUIThemedIcon
									Icon={NotePencilIcon}
									weight="regular"
									color={
										theme === LTHEME.DARK
											? isEditHovered
												? "black"
												: "white"
											: isEditHovered
												? "white"
												: "black"
									}
									className={`size-5`}
								/>
							</div>
						) : null}
					</div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
};

export { Component as LUITaskMini };
