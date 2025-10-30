import {
	LLINK_TYPE,
	LRECURRING_TYPE,
	LREMINDER_TYPE,
	LTASK_PRIORITY,
	LTASK_SCHEDULE_TYPE,
} from "little-shared/enums";
import { LTaskIcon } from "../LUIIcons";
import { useTheme } from "../../hooks/useTheme";
import { LLink, LTask, LTaskInsert, LVisualBM } from "little-shared/types";
import { twMerge } from "tailwind-merge";
import { LUIFeaturePageUD } from "../LUIFeaturePageUD/Component";
import { LUITextArea } from "../LUITextArea/Component";
import { LUITextInputT1 } from "../LUITextInput/Component";
import { LUILabel } from "../LUILabel/Component";
import { LUISelectT1 } from "../LUISelectT1/Component";
import { LUIDateNumInput } from "../LUIDateNumInput/Component";
import { LUIDateTimeInput } from "../LUIDateTimeInput/Component";
import { LUISaveLinks } from "../LUISaveLinks/Component";
import { LUITimeInput } from "../LUITimeInput/Component";
import { useEffect, useState } from "react";
import { fakeWait } from "little-shared/utils/misc";
import { putTask } from "../../../services/task";
import { LNONE } from "little-shared/constants";
import { LUICUButton } from "../LUICUButton/Component";
import { LDateUtl, LTimeUtl } from "little-shared/utils/datetime";
import { getTaskInsert } from "little-shared/utils/task";
import { useIdCache } from "../../hooks/useIdCache";
import { getReminder } from "../../../services/reminder";
import { LUIAIButton } from "../LUIAIButton/Component";
import { LittleAI } from "../../../services/ai";

const Component = ({
	className,
	links,
	saves,
	tasks,
	id,
	additionalSubmitCallback = () => {},
}: {
	className?: string;
	links: Array<LLink>;
	saves: Array<LVisualBM>;
	tasks: Array<LTask>;
	id?: number;
	additionalSubmitCallback?: () => void;
}) => {
	const { theme } = useTheme();
	const [task, setTask] = useState<LTaskInsert>(
		tasks.find((r) => r.id === id) ?? getTaskInsert(),
	);
	const { currentIds: linkedSaveIds, idCache: saveIC } = useIdCache(
		saves
			.filter(
				(x) =>
					links.find((y) => y.vbmId === x.id && y.taskId === id) !==
					undefined,
			)
			.map((x) => x.id),
	);
	const [aiRephrase, setAIRephrase] = useState<LittleAI | undefined>();
	const [aiGenerate, setAIGenerate] = useState<LittleAI | undefined>();
	const [linkedReminderType, setLinkedReminderType] = useState<
		LREMINDER_TYPE | undefined
	>();
	const validateInformation = (value: string) => {
		if (value.length > 256) {
			return {
				success: false,
				error: "Information is too long",
			};
		}
		return {
			success: true,
			error: "",
		};
	};
	const validateLabel = (value: string) => {
		if (value.length > 32) {
			return {
				success: false,
				error: "Label is too long",
			};
		}
		return {
			success: true,
			error: "",
		};
	};
	const handleSaveLinking = (vbmId: number, flag: boolean) => {
		if (!task) {
			return;
		}
		if (flag) {
			saveIC.insert(vbmId);
		} else {
			saveIC.delete(vbmId);
		}
	};

	const handleChangeReminderType = async (
		newReminderType: LREMINDER_TYPE | string,
	) => {
		if (!task) {
			return;
		}
		if (newReminderType === LNONE) {
			setLinkedReminderType(undefined);
			return;
		}
		if (newReminderType === LREMINDER_TYPE.NORMAL) {
			setLinkedReminderType(LREMINDER_TYPE.NORMAL);
		} else if (newReminderType === LREMINDER_TYPE.ESCALATING) {
			setLinkedReminderType(LREMINDER_TYPE.ESCALATING);
		} else {
			return;
		}
	};
	const handleTaskCU = async () => {
		if (!task) {
			return;
		}
		await fakeWait();
		await putTask(task, saveIC.inserts, saveIC.deletes, linkedReminderType);
		additionalSubmitCallback();
	};
	useEffect(() => {
		const reminderLink = links.find(
			(x) => x.taskId === id && x.type === LLINK_TYPE.REMINDER_TASK,
		);
		if (reminderLink && reminderLink.reminderId) {
			getReminder(reminderLink.reminderId).then((reminder) => {
				if (reminder) {
					setLinkedReminderType(reminder.type);
				}
			});
		} else {
			setLinkedReminderType(undefined);
		}
	}, [links, id]);

	useEffect(() => {
		if (!aiRephrase) {
			LittleAI.getLAIRephraseInstance().then((instance) => {
				setAIRephrase(instance);
			});
		}
		if (!aiGenerate) {
			LittleAI.getLAISummarizeInstance().then((instance) => {
				setAIGenerate(instance);
			});
		}
	}, []);

	const handleRephraseInformation = async () => {
		if (!task || !aiRephrase) {
			return;
		}
		const rephrasedInformation = await aiRephrase.rewrite(
			task.information,
			{
				tone: "as-is",
				format: "plain-text",
				length: "as-is",
			},
		);
		setTask({
			...task,
			information: rephrasedInformation,
		} as LTask);
	};

	const handleGenerateLabel = async () => {
		if (!task || !aiGenerate) {
			return;
		}
		const generatedLabel = await aiGenerate.write(task.information, {
			tone: "neutral",
			format: "plain-text",
			length: "short",
			sharedContext:
				"Generate a short label that summarizes the task information provided. (Max 5 words).",
		});
		setTask({
			...task,
			label: generatedLabel,
		} as LTask);
	};

	if (!task) {
		return;
	}
	return (
		<div
			className={twMerge(
				`flex w-full grow flex-col overflow-y-hidden`,
				className,
			)}
		>
			<LUIFeaturePageUD Icon={LTaskIcon} />
			<div
				className={`w-full grow overflow-y-auto ${theme}-scrollbar flex flex-col gap-y-1 px-4 py-4`}
			>
				<LUITextArea
					name="Information"
					passedValue={task.information}
					onChange={(value) =>
						setTask({
							...task,
							information: value,
						} as LTask)
					}
					validate={validateInformation}
					lengthLimit={256}
				/>
				<div className={`flex h-max w-full gap-x-2`}>
					<LUIAIButton
						name="Rephrase Information"
						onClick={handleRephraseInformation}
					/>
					<LUIAIButton
						name="Generate Label"
						onClick={handleGenerateLabel}
					/>
				</div>
				<LUITextInputT1
					name="Label"
					passedValue={task.label}
					onChange={(value) =>
						setTask({
							...task,
							label: value,
						} as LTask)
					}
					validate={validateLabel}
					lengthLimit={32}
				/>
				<div className={`my-2 flex h-max w-full gap-x-2`}>
					<div className={`flex h-full w-full flex-col gap-y-1`}>
						<div
							className={`flex h-max w-full items-center justify-center`}
						>
							<LUILabel name={"Priority"} />
						</div>
						<LUISelectT1
							passedItem={task.priority}
							items={[
								LTASK_PRIORITY.LOW,
								LTASK_PRIORITY.MEDIUM,
								LTASK_PRIORITY.HIGH,
							]}
							onChange={(taskPriority) =>
								setTask({
									...task,
									priority: taskPriority,
								} as LTask)
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
							passedItem={task.schedule.type}
							items={[
								LTASK_SCHEDULE_TYPE.ADHOC,
								LTASK_SCHEDULE_TYPE.DUE,
								LTASK_SCHEDULE_TYPE.RECURRING,
							]}
							onChange={(taskType) =>
								setTask({
									...task,
									schedule: {
										recurringInfo:
											taskType ===
											LTASK_SCHEDULE_TYPE.RECURRING
												? {
														day: null,
														month: null,
														type: LRECURRING_TYPE.DAILY,
														time: LTimeUtl.getNow(),
														weekDay: null,
													}
												: null,
										deadlineInfo:
											taskType === LTASK_SCHEDULE_TYPE.DUE
												? {
														deadlineDate:
															LDateUtl.getNow(),
													}
												: null,
										type: taskType,
									},
								} as LTask)
							}
						/>
					</div>
				</div>
				<div className={`my-1 flex h-max w-full flex-wrap gap-x-2`}>
					{task.schedule.type === LTASK_SCHEDULE_TYPE.RECURRING &&
					task.schedule.recurringInfo ? (
						<div
							className={`my-1 flex h-max w-max justify-start gap-x-2`}
						>
							<div
								className={`flex h-full w-40 flex-col gap-y-1`}
							>
								<div
									className={`flex h-max w-full items-center justify-center`}
								>
									<LUILabel name={"Recurring Type"} />
								</div>
								<LUISelectT1
									passedItem={
										task.schedule.recurringInfo.type
									}
									items={[
										LRECURRING_TYPE.DAILY,
										LRECURRING_TYPE.WEEKLY,
										LRECURRING_TYPE.MONTHLY,
										LRECURRING_TYPE.YEARLY,
									]}
									onChange={(recurringType) =>
										setTask({
											...task,
											schedule: {
												...task.schedule,
												recurringInfo: {
													...task.schedule
														.recurringInfo,
													type: recurringType,
													weekDay:
														recurringType ==
														LRECURRING_TYPE.WEEKLY
															? 0
															: null,
													day:
														recurringType ==
															LRECURRING_TYPE.MONTHLY ||
														recurringType ==
															LRECURRING_TYPE.YEARLY
															? 1
															: null,
													month:
														recurringType ==
														LRECURRING_TYPE.YEARLY
															? 0
															: null,
												},
											},
										} as LTask)
									}
								/>
							</div>
							{task.schedule.recurringInfo.type ===
								LRECURRING_TYPE.WEEKLY &&
							task.schedule.recurringInfo.weekDay !== null ? (
								<div
									className={`flex h-full w-44 flex-col gap-y-1`}
								>
									<div
										className={`flex h-max w-full items-center justify-center`}
									>
										<LUILabel name={"Weekday"} />
									</div>
									<LUISelectT1
										passedItem={LDateUtl.getWeekDayName(
											task.schedule.recurringInfo.weekDay,
										)}
										items={LDateUtl.getWeekDayNames()}
										onChange={(weekDay) => {
											setTask({
												...task,
												schedule: {
													...task.schedule,
													recurringInfo: {
														...task.schedule
															.recurringInfo,
														weekDay:
															LDateUtl.getWeekDayNames().indexOf(
																weekDay,
															),
													},
												},
											} as LTask);
										}}
									/>
								</div>
							) : null}
							{task.schedule.recurringInfo.type ===
								LRECURRING_TYPE.YEARLY &&
							task.schedule.recurringInfo.month !== null ? (
								<LUIDateNumInput
									name="Month"
									passedValue={
										task.schedule.recurringInfo.month + 1
									}
									onChange={(month) =>
										setTask({
											...task,
											schedule: {
												...task.schedule,
												recurringInfo: {
													...task.schedule
														.recurringInfo,
													month: month - 1,
												},
											},
										} as LTask)
									}
									onShift={(shift) => {
										setTask({
											...task,
											schedule: {
												...task.schedule,
												recurringInfo: {
													...task.schedule
														.recurringInfo,
													month:
														task.schedule
															.recurringInfo &&
														task.schedule
															.recurringInfo
															.month !== null
															? (12 +
																	task
																		.schedule
																		.recurringInfo
																		.month +
																	shift) %
																12
															: 1,
												},
											},
										} as LTask);
									}}
									minValue={1}
									maxValue={12}
									maxLength={2}
									className={`w-16`}
								/>
							) : null}
							{(task.schedule.recurringInfo.type ===
								LRECURRING_TYPE.YEARLY ||
								task.schedule.recurringInfo.type ==
									LRECURRING_TYPE.MONTHLY) &&
							task.schedule.recurringInfo.day !== null ? (
								<LUIDateNumInput
									name="Day"
									passedValue={
										task.schedule.recurringInfo.day + 1
									}
									onChange={(day) =>
										setTask({
											...task,
											schedule: {
												...task.schedule,
												recurringInfo: {
													...task.schedule
														.recurringInfo,
													day: day - 1,
												},
											},
										} as LTask)
									}
									onShift={(shift) => {
										setTask({
											...task,
											schedule: {
												...task.schedule,
												recurringInfo: {
													...task.schedule
														.recurringInfo,
													day:
														task.schedule
															.recurringInfo &&
														task.schedule
															.recurringInfo
															.day !== null
															? (28 +
																	task
																		.schedule
																		.recurringInfo
																		.day +
																	shift) %
																28
															: 1,
												},
											},
										} as LTask);
									}}
									minValue={1}
									maxValue={28}
									maxLength={2}
									className={`w-12`}
								/>
							) : null}
							<div
								className={`flex h-full w-max shrink-0 flex-col gap-y-1`}
							>
								<LUITimeInput
									name="Time"
									time={task.schedule.recurringInfo.time}
									onChange={(time) =>
										setTask({
											...task,
											schedule: {
												...task.schedule,
												recurringInfo: {
													...task.schedule
														.recurringInfo,
													time: time,
												},
											},
										} as LTask)
									}
								/>
							</div>
						</div>
					) : null}
					{task.schedule.type === LTASK_SCHEDULE_TYPE.DUE &&
					task.schedule.deadlineInfo ? (
						<div className={`h-max w-max`}>
							<LUIDateTimeInput
								name="Deadline"
								date={task.schedule.deadlineInfo?.deadlineDate}
								onChange={(date) =>
									setTask({
										...task,
										schedule: {
											...task.schedule,
											deadlineInfo: {
												...task.schedule.deadlineInfo,
												deadlineDate: date,
											},
										},
									} as LTask)
								}
							/>
						</div>
					) : null}
					{task.schedule.type === LTASK_SCHEDULE_TYPE.DUE ||
					task.schedule.type === LTASK_SCHEDULE_TYPE.RECURRING ? (
						<div className={`flex h-full w-44 flex-col gap-y-1`}>
							<div
								className={`flex h-max w-full items-center justify-center`}
							>
								<LUILabel name={"Reminder"} />
							</div>
							<LUISelectT1
								passedItem={linkedReminderType ?? LNONE}
								items={[
									LNONE,
									LREMINDER_TYPE.NORMAL,
									LREMINDER_TYPE.ESCALATING,
								]}
								onChange={handleChangeReminderType}
							/>
						</div>
					) : null}
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
					onClick={handleTaskCU}
					passedTheme={theme}
				/>
			</div>
		</div>
	);
};

export { Component as LUITaskForm };
