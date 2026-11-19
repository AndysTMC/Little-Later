import { capitalize } from "little-shared/utils/misc";
import { LTHEME } from "little-shared/enums";
import {
	CaretDownIcon,
	CaretUpIcon,
	NotePencilIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LUIGroup } from "../LUIGroup/Component";
import { LUILink } from "../LUILink/Component";
import { useTheme } from "../../hooks/useTheme";
import type { Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { linkedFrom, reminderKind } from "../../records";
import { prettyDate } from "../../../utils/dates";
import { send } from "../../../utils/send";
import { pressable } from "../../a11y";
import { LUIDeleteButton } from "../LUIDeleteButton/Component";

const Component = ({
	className,
	links,
	saves,
	tasks,
	reminder,
	disableNavs,
}: {
	className?: string;
	links: Array<LinkRow>;
	saves: Array<Save>;
	tasks: Array<Task>;
	reminder: Reminder;
	disableNavs?: boolean;
}) => {
	const { theme } = useTheme();
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
				`flex h-max w-full flex-col ${showDetails ? "rounded-lg" : "rounded-full"} shrink-0 overflow-hidden`,
				className,
			)}
		>
			<div
				className={`flex h-10 w-full ${
					theme === LTHEME.DARK ? "bg-neutral-900" : "bg-neutral-100"
				} `}
			>
				<div
					className={`flex h-auto w-44 items-center justify-center ${showDetails ? "rounded-t-lg" : "rounded-full"} ${
						theme === LTHEME.DARK
							? "border border-white bg-black text-white"
							: "border border-black bg-white text-black"
					} text-sm font-semibold`}
				>
					{prettyDate(reminder.target)}
				</div>
				<div
					className={`flex grow flex-col items-center justify-center pl-2`}
				>
					<div
						className={`w-full text-xs italic opacity-75 ${
							theme === LTHEME.DARK ? "text-white" : "text-black"
						} `}
					>
						{capitalize(kind) + (nextFire ? " | Next At:" : "")}
					</div>
					{nextFire ? (
						<div
							className={`w-full text-xs font-medium opacity-75 ${
								theme === LTHEME.DARK
									? "text-white"
									: "text-black"
							} `}
						>
							{prettyDate(nextFire)}
						</div>
					) : null}
				</div>
				<div
					className={`flex h-full w-max items-center justify-center px-1`}
				>
					<div
						className={`flex h-max w-max cursor-pointer items-center justify-center gap-x-1`}
						{...pressable(() => setShowDetails(!showDetails))}
						aria-expanded={showDetails}
					>
						<div
							className={`text-base font-medium ${
								theme === LTHEME.DARK
									? "text-white"
									: "text-black"
							} `}
						>
							Details
						</div>
						<LUIThemedIcon
							Icon={showDetails ? CaretUpIcon : CaretDownIcon}
							color={theme === LTHEME.DARK ? "white" : "black"}
							weight="bold"
							className={`h-4 w-4`}
						/>
					</div>
				</div>
				{!disableNavs ? (
					<button
						className={`h-10 w-10 ${theme === LTHEME.DARK ? "bg-white" : "bg-black"} flex cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-50`}
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
							color={theme === LTHEME.DARK ? "black" : "white"}
							weight="bold"
							className={`h-6 w-6`}
						/>
					</button>
				) : null}
			</div>
			<AnimatePresence>
				{showDetails ? (
					<motion.div
						className={`w-full px-4 py-1 ${theme === LTHEME.DARK ? "border-white" : "border-black"} rounded-b-lg border-x border-b`}
						initial={{
							opacity: 0,
							y: -10,
						}}
						animate={{
							opacity: 1,
							y: 0,
							transition: {
								duration: 0.2,
							},
						}}
						exit={{
							opacity: 0,
							y: -10,
							transition: {
								duration: 0,
							},
						}}
					>
						{linkedSaves.length > 0 ? (
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
									/>
								))}
							</LUIGroup>
						) : null}

						<div
							className={`text-sm ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
						>
							{reminder.message}
						</div>
						<div className={`flex h-max grow justify-end`}>
							<LUIDeleteButton
								className="mt-1"
								onDelete={() =>
									send("reminder.delete", { id: reminder.id })
								}
								failureMessage="Couldn't delete this reminder."
								disabled={linkedTask !== undefined}
							/>
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
};

export { Component as LUIReminderMini };
