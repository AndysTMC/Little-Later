import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import { LReminder } from "little-shared/types";
import { LUIUnlinker } from "../LUIUnlinker/Component";

const Component = ({
	className,
	reminders,
	linkedReminderIds,
	handleUnlinkReminder,
}: {
	className?: string;
	reminders: Array<LReminder>;
	linkedReminderIds: number[];
	handleUnlinkReminder: (reminderId: number) => void;
}) => {
	const { theme } = useTheme();
	const linkedReminders = reminders.filter((x) =>
		linkedReminderIds.includes(x.id),
	);
	return (
		<div
			className={twMerge(
				`my-1 flex h-max w-full flex-col gap-y-1`,
				className,
			)}
		>
			<div
				className={`flex h-max w-full items-center justify-start gap-x-1`}
			>
				<div
					className={`rounded-full border font-semibold ${
						theme === LTHEME.DARK
							? "border-white text-white"
							: "border-black text-black"
					} px-5`}
				>
					Reminders
				</div>
			</div>
			<div className={`flex max-h-56 w-full flex-col`}>
				{linkedReminders.map((reminder, index) => (
					<LUIUnlinker
						key={index}
						content={reminder.message}
						id={reminder.id}
						handleUnlink={handleUnlinkReminder}
					/>
				))}
			</div>
		</div>
	);
};

export { Component as LUIReminderLinks };
