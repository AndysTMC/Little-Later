import { LTaskIcon } from "../LUIIcons";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { LUIFeaturePageUD } from "../LUIFeaturePageUD/Component";
import { LUITextArea } from "../LUITextArea/Component";
import { LUITextInputT1 } from "../LUITextInput/Component";
import { LUILabel } from "../LUILabel/Component";
import { LUISelectT1 } from "../LUISelectT1/Component";
import { LUIDateNumInput } from "../LUIDateNumInput/Component";
import { LUIDateTimeInput } from "../LUIDateTimeInput/Component";
import { LUIVBMLinks } from "../LUIVBMLinks/Component";
import { LUITimeInput } from "../LUITimeInput/Component";
import { useEffect, useState } from "react";
import { fakeWait } from "little-shared/utils/misc";
import {
	LMAX_TASK_INFORMATION_LENGTH,
	LMAX_TASK_LABEL_LENGTH,
	LNONE,
} from "little-shared/constants";
import type { Frequency, RecurrenceRule } from "little-shared/utils/schedule";
import { LUICUButton } from "../LUICUButton/Component";
import { LTHEME } from "little-shared/enums";
import { LUIAIButton } from "../LUIAIButton/Component";
import { LittleAI } from "../../../services/ai";
import type {
	Reminder,
	Save,
	Task,
	TaskPriority,
} from "../../../storage/repositories";
import type { LinkRow, TaskSchedule } from "../../../storage/schema";
import { linkedFrom, linkedTo, reminderKind } from "../../records";
import { WEEKDAY_NAMES, deviceZone, nextHour } from "../../../utils/dates";
import { send } from "../../../utils/send";

type ScheduleKind = TaskSchedule["kind"];
type ReminderKind = "normal" | "escalating";

const PRIORITIES: Array<TaskPriority> = ["low", "medium", "high"];
const SCHEDULE_KINDS: Array<ScheduleKind> = ["anytime", "due", "recurring"];
const FREQUENCIES: Array<Frequency> = ["daily", "weekly", "monthly", "yearly"];
const REMINDER_KINDS: Array<ReminderKind> = ["normal", "escalating"];

type Draft = {
	information: string;
	label: string;
	priority: TaskPriority;
	schedule: TaskSchedule;
};

const today = () => Temporal.Now.plainDateISO(deviceZone());

// A rule of the given frequency that keeps what still applies of `from`.
const ruleOf = (freq: Frequency, from?: RecurrenceRule): RecurrenceRule => {
	const date = today();
	const base = {
		freq,
		interval: from?.interval ?? 1,
		time:
			from?.time ??
			Temporal.Now.plainTimeISO(deviceZone()).toString({
				smallestUnit: "minute",
			}),
		anchor: from?.anchor ?? date.toString(),
		zone: from?.zone ?? "floating",
	};
	switch (freq) {
		case "daily":
			return base;
		case "weekly":
			return { ...base, byWeekday: from?.byWeekday ?? [date.dayOfWeek] };
		case "monthly":
			return { ...base, byMonthDay: from?.byMonthDay ?? date.day };
		case "yearly":
			return {
				...base,
				byMonth: from?.byMonth ?? date.month,
				byMonthDay: from?.byMonthDay ?? date.day,
			};
	}
};

const scheduleOf = (kind: ScheduleKind): TaskSchedule => {
	switch (kind) {
		case "anytime":
			return { kind };
		case "due":
			return { kind, at: nextHour() };
		case "recurring":
			return { kind, rule: ruleOf("daily") };
	}
};

// Cycles `value + shift` through min..max.
const wrap = (value: number, shift: number, min: number, max: number) =>
	((((value - min + shift) % (max - min + 1)) + (max - min + 1)) %
		(max - min + 1)) +
	min;

const RuleFields = ({
	rule,
	onChange,
}: {
	rule: RecurrenceRule;
	onChange: (rule: RecurrenceRule) => void;
}) => (
	<div className={`my-1 flex h-max w-max justify-start gap-x-2`}>
		<div className={`flex h-full w-40 flex-col gap-y-1`}>
			<div className={`flex h-max w-full items-center justify-center`}>
				<LUILabel name={"Repeats"} />
			</div>
			<LUISelectT1
				passedItem={rule.freq}
				items={FREQUENCIES}
				onChange={(freq) => onChange(ruleOf(freq as Frequency, rule))}
			/>
		</div>
		{rule.freq === "weekly" && rule.byWeekday ? (
			<div className={`flex h-full w-44 flex-col gap-y-1`}>
				<div
					className={`flex h-max w-full items-center justify-center`}
				>
					<LUILabel name={"Weekday"} />
				</div>
				<LUISelectT1
					passedItem={WEEKDAY_NAMES[rule.byWeekday[0] - 1]}
					items={WEEKDAY_NAMES}
					onChange={(weekday) =>
						onChange({
							...rule,
							byWeekday: [WEEKDAY_NAMES.indexOf(weekday) + 1],
						})
					}
				/>
			</div>
		) : null}
		{rule.freq === "yearly" && rule.byMonth !== undefined ? (
			<LUIDateNumInput
				name="Month"
				passedValue={rule.byMonth}
				onChange={(byMonth) => onChange({ ...rule, byMonth })}
				onShift={(shift) =>
					onChange({
						...rule,
						byMonth: wrap(rule.byMonth ?? 1, shift, 1, 12),
					})
				}
				minValue={1}
				maxValue={12}
				maxLength={2}
				className={`w-16`}
			/>
		) : null}
		{(rule.freq === "monthly" || rule.freq === "yearly") &&
		rule.byMonthDay !== undefined ? (
			<LUIDateNumInput
				name="Day"
				passedValue={rule.byMonthDay}
				onChange={(byMonthDay) => onChange({ ...rule, byMonthDay })}
				onShift={(shift) =>
					onChange({
						...rule,
						byMonthDay: wrap(rule.byMonthDay ?? 1, shift, 1, 31),
					})
				}
				minValue={1}
				maxValue={31}
				maxLength={2}
				className={`w-12`}
			/>
		) : null}
		<div className={`flex h-full w-max shrink-0 flex-col gap-y-1`}>
			<LUITimeInput
				name="Time"
				time={rule.time}
				onChange={(time) => onChange({ ...rule, time })}
			/>
		</div>
	</div>
);

const Component = ({
	className,
	links,
	reminders,
	saves,
	task,
	prelinkedSaveId,
	additionalSubmitCallback = () => {},
}: {
	className?: string;
	links: Array<LinkRow>;
	reminders: Array<Reminder>;
	saves: Array<Save>;
	// The task to edit; a new one when left out.
	task?: Task;
	prelinkedSaveId?: string;
	additionalSubmitCallback?: () => void;
}) => {
	const { theme } = useTheme();
	const [draft, setDraft] = useState<Draft>(() => ({
		information: task?.information ?? "",
		label: task?.label ?? "",
		priority: task?.priority ?? "medium",
		schedule: task?.schedule ?? scheduleOf("anytime"),
	}));
	// Edits stay local until Create or Update, then go out as commands,
	// compared with what is stored then.
	const storedSaveIds = task
		? linkedFrom(links, task.id, saves).map((save) => save.id)
		: [];
	const [linkedReminder] = task ? linkedTo(links, task.id, reminders) : [];
	const storedReminder: ReminderKind | null = linkedReminder
		? reminderKind(linkedReminder)
		: null;
	const [linkedSaveIds, setLinkedSaveIds] = useState(() =>
		prelinkedSaveId !== undefined &&
		!storedSaveIds.includes(prelinkedSaveId)
			? [...storedSaveIds, prelinkedSaveId]
			: storedSaveIds,
	);
	const [reminder, setReminder] = useState(storedReminder);
	const [warning, setWarning] = useState("");
	const [aiRephrase, setAIRephrase] = useState<LittleAI | undefined>();
	const [aiGenerate, setAIGenerate] = useState<LittleAI | undefined>();

	const validateInformation = (value: string) =>
		value.length > LMAX_TASK_INFORMATION_LENGTH
			? { success: false, error: "Information is too long" }
			: { success: true, error: "" };
	const validateLabel = (value: string) =>
		value.length > LMAX_TASK_LABEL_LENGTH
			? { success: false, error: "Label is too long" }
			: { success: true, error: "" };
	const isValid =
		draft.information.trim() !== "" &&
		validateInformation(draft.information).success &&
		validateLabel(draft.label).success;

	const handleSaveLinking = (saveId: string, flag: boolean) => {
		setLinkedSaveIds((ids) =>
			flag
				? [...ids.filter((id) => id !== saveId), saveId]
				: ids.filter((id) => id !== saveId),
		);
	};

	const setSchedule = (schedule: TaskSchedule) => {
		setDraft((current) => ({ ...current, schedule }));
		if (schedule.kind === "anytime") {
			setReminder(null);
		}
	};

	const handleTaskCU = async () => {
		if (!isValid) {
			return;
		}
		setWarning("");
		await fakeWait();
		try {
			await submit();
			additionalSubmitCallback();
		} catch (error) {
			setWarning(
				error instanceof Error
					? error.message
					: "Couldn't save this task.",
			);
		}
	};

	const submit = async () => {
		const content = {
			information: draft.information,
			label: draft.label,
			priority: draft.priority,
		};
		let taskId: string;
		let alreadyLinked: Array<string>;
		if (task) {
			taskId = task.id;
			alreadyLinked = storedSaveIds;
			// Sending an unchanged recurring schedule would move an overdue
			// occurrence on, so only changes go out.
			const scheduleChanged =
				JSON.stringify(draft.schedule) !==
				JSON.stringify(task.schedule);
			await send("task.update", {
				id: task.id,
				...content,
				schedule: scheduleChanged ? draft.schedule : undefined,
				reminder: reminder !== storedReminder ? reminder : undefined,
			});
		} else {
			const [firstSaveId] = linkedSaveIds;
			({ id: taskId } = await send("task.create", {
				...content,
				schedule: draft.schedule,
				reminder,
				saveId: firstSaveId,
			}));
			alreadyLinked = firstSaveId === undefined ? [] : [firstSaveId];
		}
		for (const saveId of linkedSaveIds) {
			if (!alreadyLinked.includes(saveId)) {
				await send("link.create", { fromId: taskId, toId: saveId });
			}
		}
		for (const saveId of alreadyLinked) {
			if (!linkedSaveIds.includes(saveId)) {
				await send("link.delete", { fromId: taskId, toId: saveId });
			}
		}
	};

	useEffect(() => {
		if (!aiRephrase) {
			LittleAI.getLAIRephraseInstance().then((instance) => {
				setAIRephrase(instance);
			});
		}
		if (!aiGenerate) {
			LittleAI.getLAIGenerateInstance().then((instance) => {
				setAIGenerate(instance);
			});
		}
	}, []);

	const handleRephraseInformation = async () => {
		if (!aiRephrase) {
			return;
		}
		const information = await aiRephrase.rewrite(draft.information, {
			tone: "as-is",
			format: "plain-text",
			length: "as-is",
		});
		setDraft((current) => ({ ...current, information }));
	};

	const handleGenerateLabel = async () => {
		if (!aiGenerate) {
			return;
		}
		const label = await aiGenerate.write(draft.information, {
			tone: "neutral",
			format: "plain-text",
			length: "short",
			sharedContext:
				"Generate a short label that summarizes the task information provided. (Max 5 words).",
		});
		if (label.trim() === "") {
			return;
		}
		setDraft((current) => ({ ...current, label: label.trim() }));
	};

	const { schedule } = draft;
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
					passedValue={draft.information}
					onChange={(information) =>
						setDraft((current) => ({ ...current, information }))
					}
					validate={validateInformation}
					lengthLimit={LMAX_TASK_INFORMATION_LENGTH}
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
					passedValue={draft.label}
					onChange={(label) =>
						setDraft((current) => ({ ...current, label }))
					}
					validate={validateLabel}
					lengthLimit={LMAX_TASK_LABEL_LENGTH}
				/>
				<div className={`my-2 flex h-max w-full gap-x-2`}>
					<div className={`flex h-full w-full flex-col gap-y-1`}>
						<div
							className={`flex h-max w-full items-center justify-center`}
						>
							<LUILabel name={"Priority"} />
						</div>
						<LUISelectT1
							passedItem={draft.priority}
							items={PRIORITIES}
							onChange={(priority) =>
								setDraft((current) => ({
									...current,
									priority: priority as TaskPriority,
								}))
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
							passedItem={schedule.kind}
							items={SCHEDULE_KINDS}
							onChange={(kind) =>
								kind !== schedule.kind &&
								setSchedule(scheduleOf(kind as ScheduleKind))
							}
						/>
					</div>
				</div>
				<div className={`my-1 flex h-max w-full flex-wrap gap-x-2`}>
					{schedule.kind === "recurring" ? (
						<RuleFields
							rule={schedule.rule}
							onChange={(rule) =>
								setSchedule({ kind: "recurring", rule })
							}
						/>
					) : null}
					{schedule.kind === "due" ? (
						<div className={`h-max w-max`}>
							<LUIDateTimeInput
								name="Deadline"
								value={schedule.at}
								onChange={(at) =>
									setSchedule({ kind: "due", at })
								}
							/>
						</div>
					) : null}
					{schedule.kind !== "anytime" ? (
						<div className={`flex h-full w-44 flex-col gap-y-1`}>
							<div
								className={`flex h-max w-full items-center justify-center`}
							>
								<LUILabel name={"Reminder"} />
							</div>
							<LUISelectT1
								passedItem={reminder ?? LNONE}
								items={[LNONE, ...REMINDER_KINDS]}
								onChange={(kind) =>
									setReminder(
										REMINDER_KINDS.includes(
											kind as ReminderKind,
										)
											? (kind as ReminderKind)
											: null,
									)
								}
							/>
						</div>
					) : null}
				</div>
				<LUIVBMLinks
					saves={saves}
					linkedSaveIds={linkedSaveIds}
					handleSaveLinking={handleSaveLinking}
				/>
				{warning !== "" ? (
					<div
						className={`text-sm italic ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
					>
						{warning}
					</div>
				) : null}
			</div>
			<div
				className={`flex h-16 w-full items-center justify-center pt-1 pb-2`}
			>
				<LUICUButton
					name={task ? "Update" : "Create"}
					onClick={handleTaskCU}
					passedTheme={theme}
					disabled={!isValid}
				/>
			</div>
		</div>
	);
};

export { Component as LUITaskForm };
