import {
	LLink,
	LReminder,
	LReminderInsert,
	LVisualBM,
} from "little-shared/types";
import { LREMINDER_TYPE } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { LUIFeaturePageUD } from "../LUIFeaturePageUD/Component";
import { LUITextArea } from "../LUITextArea/Component";
import { LReminderIcon } from "../LUIIcons";
import { LUIDateTimeInput } from "../LUIDateTimeInput/Component";
import { LUILabel } from "../LUILabel/Component";
import { LUISelectT1 } from "../LUISelectT1/Component";
import { LUISaveLinks } from "../LUISaveLinks/Component";
import { LUICUButton } from "../LUICUButton/Component";
import { putReminder } from "../../../services/reminder";
import { fakeWait } from "little-shared/utils/misc";
import { useEffect, useState } from "react";
import { getReminderInsert } from "../../../../../../packages/shared/src/utils/reminder";
import { useIdCache } from "../../hooks/useIdCache";
import { LUIAIButton } from "../LUIAIButton/Component";
import { LittleAI } from "../../../services/ai";

const Component = ({
	className,
	links,
	reminders,
	saves,
	id,
	additionalSubmitCallback = () => {},
}: {
	className?: string;
	links: Array<LLink>;
	reminders: Array<LReminder>;
	saves: Array<LVisualBM>;
	id?: number;
	additionalSubmitCallback?: () => void;
}) => {
	const { theme } = useTheme();
	const [reminder, setReminder] = useState<LReminderInsert>(
		reminders.find((r) => r.id === id) ?? getReminderInsert(),
	);

	const { currentIds: linkedSaveIds, idCache: saveIC } = useIdCache(
		saves
			.filter(
				(x) =>
					links.find(
						(y) => y.vbmId === x.id && y.reminderId === id,
					) !== undefined,
			)
			.map((x) => x.id),
	);

	const [aiRephrase, setAIRephrase] = useState<LittleAI | undefined>();

	const validateMessage = (value: string) => {
		if (value.length === 0) {
			return {
				success: false,
				error: "Message cannot be empty",
			};
		} else if (value.length > 256) {
			return {
				success: false,
				error: "Message is too long",
			};
		}
		return {
			success: true,
			error: "",
		};
	};

	const handleSaveLinking = (vbmId: number, flag: boolean) => {
		if (!reminder) {
			return;
		}
		if (flag) {
			saveIC.insert(vbmId);
		} else {
			saveIC.delete(vbmId);
		}
	};

	const handleReminderCU = async () => {
		if (!reminder) {
			return;
		}
		await fakeWait();
		await putReminder(reminder, saveIC.inserts, saveIC.deletes);
		additionalSubmitCallback();
	};

	useEffect(() => {
		if (!aiRephrase) {
			LittleAI.getLAIRephraseInstance().then((instance) => {
				setAIRephrase(instance);
			});
		}
	}, []);

	const handleRephraseMessage = async () => {
		if (!reminder || !aiRephrase) {
			return;
		}
		const rephrasedInformation = await aiRephrase.rewrite(
			reminder.message,
			{
				tone: "as-is",
				format: "plain-text",
				length: "as-is",
			},
		);
		setReminder({
			...reminder,
			message: rephrasedInformation,
		} as LReminder);
	};

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
					passedValue={reminder.message}
					onChange={(value) =>
						setReminder({
							...reminder,
							message: value,
						} as LReminder)
					}
					validate={validateMessage}
					lengthLimit={256}
				/>
				<div className={`h-max w-full shrink-0`}>
					<LUIAIButton
						name="Rephrase Message"
						onClick={handleRephraseMessage}
					/>
				</div>
				<div className={`my-2 flex h-max w-full gap-x-2`}>
					<div className={`h-max w-max`}>
						<LUIDateTimeInput
							name="TimeStamp"
							date={reminder.targetDate}
							onChange={(targetDate) =>
								setReminder({
									...reminder,
									targetDate,
								} as LReminder)
							}
						/>
					</div>
					<div className={`flex h-full w-full flex-col gap-y-1`}>
						<div
							className={`flex h-max w-full items-center justify-center`}
						>
							<LUILabel name={"Type"} />
						</div>
						<LUISelectT1
							passedItem={reminder.type}
							items={[
								LREMINDER_TYPE.NORMAL,
								LREMINDER_TYPE.ESCALATING,
							]}
							onChange={(reminderType) =>
								setReminder({
									...reminder,
									type: reminderType,
								} as LReminder)
							}
						/>
					</div>
				</div>
				<LUISaveLinks
					saves={saves}
					linkedSaveIds={linkedSaveIds}
					handleSaveLinking={handleSaveLinking}
				/>
			</div>
			<div
				className={`flex h-16 w-full items-center justify-center pt-1 pb-2`}
			>
				<LUICUButton
					name={id ? "Update" : "Create"}
					onClick={handleReminderCU}
					passedTheme={theme}
				/>
			</div>
		</div>
	);
};

export { Component as LUIReminderForm };
