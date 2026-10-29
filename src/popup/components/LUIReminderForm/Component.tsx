import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { LUIFeaturePageUD } from "../LUIFeaturePageUD/Component";
import { LUITextArea } from "../LUITextArea/Component";
import { LReminderIcon } from "../LUIIcons";
import { LUIDateTimeInput } from "../LUIDateTimeInput/Component";
import { LUILabel } from "../LUILabel/Component";
import { LUISelectT1 } from "../LUISelectT1/Component";
import { LUIVBMLinks } from "../LUIVBMLinks/Component";
import { LUICUButton } from "../LUICUButton/Component";
import { LUILink } from "../LUILink/Component";
import { fakeWait } from "little-shared/utils/misc";
import { useEffect, useState } from "react";
import { LMAX_REMINDER_MESSAGE_LENGTH } from "little-shared/constants";
import { LTHEME } from "little-shared/enums";
import { LUIAIButton } from "../LUIAIButton/Component";
import { LittleAI } from "../../../services/ai";
import type { Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { linkedFrom, reminderKind } from "../../records";
import { nextHour } from "../../../utils/dates";
import { send } from "../../../utils/send";

type ReminderKind = "normal" | "escalating";
const REMINDER_KINDS: Array<ReminderKind> = ["normal", "escalating"];

const Component = ({
	className,
	links,
	saves,
	tasks = [],
	reminder,
	prelinkedSaveId,
	additionalSubmitCallback = () => {},
}: {
	className?: string;
	links: Array<LinkRow>;
	saves: Array<Save>;
	tasks?: Array<Task>;
	// The reminder to edit; a new one when left out.
	reminder?: Reminder;
	prelinkedSaveId?: string;
	additionalSubmitCallback?: () => void;
}) => {
	const { theme } = useTheme();
	const [message, setMessage] = useState(reminder?.message ?? "");
	const [target, setTarget] = useState(() => reminder?.target ?? nextHour());
	const [kind, setKind] = useState<ReminderKind>(
		reminder ? reminderKind(reminder) : "normal",
	);
	const [warning, setWarning] = useState("");
	// A task's own reminder follows the task's deadline (task.update).
	const [task] = reminder ? linkedFrom(links, reminder.id, tasks) : [];

	// Edits stay local until Create or Update, then go out as commands,
	// compared with what is stored then.
	const storedSaveIds = reminder
		? linkedFrom(links, reminder.id, saves).map((save) => save.id)
		: [];
	const [linkedSaveIds, setLinkedSaveIds] = useState(() =>
		prelinkedSaveId !== undefined &&
		!storedSaveIds.includes(prelinkedSaveId)
			? [...storedSaveIds, prelinkedSaveId]
			: storedSaveIds,
	);

	const [aiRephrase, setAIRephrase] = useState<LittleAI | undefined>();

	const validateMessage = (value: string) => {
		if (value.trim().length === 0) {
			return { success: false, error: "Message cannot be empty" };
		} else if (value.length > LMAX_REMINDER_MESSAGE_LENGTH) {
			return { success: false, error: "Message is too long" };
		}
		return { success: true, error: "" };
	};

	const handleSaveLinking = (saveId: string, flag: boolean) => {
		setLinkedSaveIds((ids) =>
			flag
				? [...ids.filter((id) => id !== saveId), saveId]
				: ids.filter((id) => id !== saveId),
		);
	};

	const handleReminderCU = async () => {
		if (!validateMessage(message).success) {
			return;
		}
		setWarning("");
		await fakeWait();
		try {
			let reminderId: string;
			let alreadyLinked: Array<string>;
			if (reminder) {
				reminderId = reminder.id;
				alreadyLinked = storedSaveIds;
				// The schedule restarts only when it changes, and only a
				// future time is accepted then.
				const storedKind = reminderKind(reminder);
				await send("reminder.update", {
					id: reminder.id,
					message,
					target: target !== reminder.target ? target : undefined,
					escalate:
						kind !== storedKind ? kind === "escalating" : undefined,
				});
			} else {
				const [firstSaveId] = linkedSaveIds;
				({ id: reminderId } = await send("reminder.create", {
					message,
					target,
					escalate: kind === "escalating",
					saveId: firstSaveId,
				}));
				alreadyLinked = firstSaveId === undefined ? [] : [firstSaveId];
			}
			for (const saveId of linkedSaveIds) {
				if (!alreadyLinked.includes(saveId)) {
					await send("link.create", {
						fromId: reminderId,
						toId: saveId,
					});
				}
			}
			for (const saveId of alreadyLinked) {
				if (!linkedSaveIds.includes(saveId)) {
					await send("link.delete", {
						fromId: reminderId,
						toId: saveId,
					});
				}
			}
			additionalSubmitCallback();
		} catch (error) {
			setWarning(
				error instanceof Error
					? error.message
					: "Couldn't save this reminder.",
			);
		}
	};

	useEffect(() => {
		if (!aiRephrase) {
			LittleAI.getLAIRephraseInstance().then((instance) => {
				setAIRephrase(instance);
			});
		}
	}, []);

	const handleRephraseMessage = async () => {
		if (!aiRephrase) {
			return;
		}
		setMessage(
			await aiRephrase.rewrite(message, {
				tone: "as-is",
				format: "plain-text",
				length: "as-is",
			}),
		);
	};

	const textColor = theme === LTHEME.DARK ? "text-white" : "text-black";
	return (
		<div
			className={twMerge(
				`flex w-full grow flex-col overflow-y-hidden`,
				className,
			)}
		>
			<LUIFeaturePageUD Icon={LReminderIcon} />
			<div
				className={`w-full grow overflow-y-auto ${theme}-scrollbar flex flex-col gap-y-1 px-4 py-4`}
			>
				<LUITextArea
					name="Message"
					passedValue={message}
					onChange={setMessage}
					validate={validateMessage}
					lengthLimit={LMAX_REMINDER_MESSAGE_LENGTH}
				/>
				<div className={`h-max w-full shrink-0`}>
					<LUIAIButton
						name="Rephrase Message"
						onClick={handleRephraseMessage}
					/>
				</div>
				{task ? (
					<div className={`my-2 flex h-max w-full flex-col gap-y-1`}>
						<div className={`text-sm italic ${textColor}`}>
							This reminder follows its task's deadline. Change
							the time on the task.
						</div>
						<LUILink
							content={task.information}
							navigateTo={"/task/" + task.id}
							hoverBackground={
								theme === LTHEME.DARK
									? "bg-neutral-800"
									: "bg-neutral-200"
							}
						/>
					</div>
				) : (
					<div className={`my-2 flex h-max w-full gap-x-2`}>
						<div className={`h-max w-max`}>
							<LUIDateTimeInput
								name="TimeStamp"
								value={target}
								onChange={setTarget}
							/>
						</div>
						<div className={`flex h-full w-full flex-col gap-y-1`}>
							<div
								className={`flex h-max w-full items-center justify-center`}
							>
								<LUILabel name={"Type"} />
							</div>
							<LUISelectT1
								passedItem={kind}
								items={REMINDER_KINDS}
								onChange={(value) =>
									setKind(value as ReminderKind)
								}
							/>
						</div>
					</div>
				)}
				<LUIVBMLinks
					saves={saves}
					linkedSaveIds={linkedSaveIds}
					handleSaveLinking={handleSaveLinking}
				/>
				{warning !== "" ? (
					<div className={`text-sm italic ${textColor}`}>
						{warning}
					</div>
				) : null}
			</div>
			<div
				className={`flex h-16 w-full items-center justify-center pt-1 pb-2`}
			>
				<LUICUButton
					name={reminder ? "Update" : "Create"}
					onClick={handleReminderCU}
					passedTheme={theme}
					disabled={!validateMessage(message).success}
				/>
			</div>
		</div>
	);
};

export { Component as LUIReminderForm };
