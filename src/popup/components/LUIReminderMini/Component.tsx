import { capitalize } from "little-shared/utils/misc";
import { LTHEME } from "little-shared/enums";
import {
	CaretDownIcon,
	CaretUpIcon,
	NotePencilIcon,
} from "@phosphor-icons/react";
import { useContext, useState } from "react";
import { HomeContext } from "../../contexts/Home";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
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
	const { setHomeNavigation, setHomeSubNavigation, setShouldHomeNavigate } =
		useContext(HomeContext);
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
		setHomeSubNavigation({
			exit: exitTransitions.none,
		});
		setHomeNavigation({
			exit: exitTransitions.slideLeft,
			navigateTo: "/reminder/" + reminder.id,
			navigateOptions: {
				state: { entryTransition: entryTransitions.slideLeft },
			},
		});
		setShouldHomeNavigate(true);
	};
	const handleDelete = async () => {
		await send("reminder.delete", { id: reminder.id });
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
						onClick={() => setShowDetails(!showDetails)}
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
								title={linkedSaves.length + " Saves(s)"}
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
							<button
								className={`h-max w-max text-xs ${
									theme === LTHEME.DARK
										? "bg-neutral-800 text-white"
										: "bg-neutral-200 text-black"
								} mt-1 cursor-pointer rounded-full px-2 py-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50`}
								onClick={handleDelete}
								disabled={linkedTask !== undefined}
							>
								Delete
							</button>
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
};

export { Component as LUIReminderMini };
