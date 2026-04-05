import { LLink, LNote, LReminder, LTask, LVisualBM } from "little-shared/types";
import { LTHEME } from "little-shared/enums";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";
import { useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { LUIFeaturePageUD } from "../LUIFeaturePageUD/Component";
import { LUITextInputT1 } from "../LUITextInput/Component";
import { LUIWebPreview } from "../LUIWebPreview/Component";
import { LUICUButton } from "../LUICUButton/Component";
import { putVisualBM } from "../../../services/visualBM";
import { fakeWait } from "little-shared/utils/misc";
import { LVBMIcon } from "../LUIIcons";
import { LUIReminderLinks } from "../LUIReminderLinks/Component";
import { LUITaskLinks } from "../LUITaskLinks/Component";
import { LDateUtl } from "little-shared/utils/datetime";
import { useIdCache } from "../../hooks/useIdCache";
import { useIdObjectChangeSet } from "../../hooks/useIdObjectChangeSet";
import { useVBMImage } from "../../hooks/useVBMImage";

const Component = ({
	className,
	links,
	notes,
	reminders,
	saves,
	tasks,
	id,
}: {
	className?: string;
	links: Array<LLink>;
	notes: Array<LNote>;
	reminders: Array<LReminder>;
	saves: Array<LVisualBM>;
	tasks: Array<LTask>;
	id: number;
}) => {
	const { theme } = useTheme();
	const [save, setSave] = useState(saves.find((save) => save.id === id)!);
	const { preview } = useVBMImage(save.id);

	const { currentIds: linkedTaskIds, idCache: taskIC } = useIdCache(
		tasks
			.filter(
				(x) =>
					links.find(
						(y) => y.taskId === x.id && y.vbmId === save.id,
					) !== undefined,
			)
			.map((x) => x.id),
	);

	const { currentIds: linkedReminderIds, idCache: reminderIC } = useIdCache(
		reminders
			.filter(
				(x) =>
					links.find(
						(y) => y.reminderId === x.id && y.vbmId === save.id,
					) !== undefined,
			)
			.map((x) => x.id),
	);

	const { currentObjects: linkedNotes, idObjectCS: noteCS } =
		useIdObjectChangeSet(
			notes.filter(
				(x) =>
					links.find(
						(y) => y.noteId === x.id && y.vbmId === save.id,
					) !== undefined,
			),
		);

	const validateName = (value: string) => {
		if (value.length > 64) {
			return {
				success: false,
				error: "Name is too long",
			};
		}
		return {
			success: true,
			error: "",
		};
	};

	const handleCreateNote = () => {
		noteCS.insert({
			id: noteCS.newId,
			content: "",
			lastModificationDate: LDateUtl.getNow(),
		});
	};

	const handleUpdateNote = (modifiedNote: LNote) => {
		noteCS.update(modifiedNote);
	};

	const handleNoteContentChange = (noteId: number, content: string) => {
		const note = linkedNotes.find((x) => x.id === noteId);
		if (!note) {
			return;
		}
		handleUpdateNote({
			...note,
			content,
			lastModificationDate: LDateUtl.getNow(),
		});
	};

	const handleDeleteNote = (note: LNote) => {
		noteCS.delete(note);
	};

	const handleUnlinkTask = (taskId: number) => {
		taskIC.delete(taskId);
	};

	const handleUnlinkReminder = (reminderId: number) => {
		reminderIC.delete(reminderId);
	};

	const handleUpdateSave = async () => {
		await fakeWait();
		await putVisualBM(
			save,
			noteCS.creates,
			noteCS.updates,
			noteCS.deletes,
			reminderIC.deletes,
			taskIC.deletes,
		);
	};

	return (
		<div
			className={twMerge(
				`flex w-full grow flex-col overflow-y-hidden`,
				className,
			)}
		>
			<LUIFeaturePageUD Icon={LVBMIcon} />
			<div
				className={`w-full grow overflow-y-auto ${theme}-scrollbar flex flex-col gap-y-1 px-4 py-6`}
			>
				<LUITextInputT1
					name="Name"
					passedValue={save.customName}
					onChange={(value) =>
						setSave({
							...save,
							customName: value,
						} as LVisualBM)
					}
					validate={validateName}
					lengthLimit={64}
				/>
				<LUITextInputT1
					name="URL"
					passedValue={save.url}
					onChange={() => {}}
					validate={() => {
						return {
							success: true,
							error: "",
						};
					}}
					lengthLimit={256}
					disabled
				/>
				<LUIWebPreview previewBlob={preview?.blob} url={save.url} />
				<div className={`my-1 flex h-max w-full flex-col gap-y-1`}>
					<div className={`my-1 flex h-max w-full flex-col gap-y-1`}>
						<div
							className={`flex h-max w-full items-center justify-start gap-x-1`}
						>
							<div
								className={`rounded-full text-lg font-bold ${
									theme === LTHEME.DARK
										? "text-white"
										: "text-black"
								} `}
							>
								Notes
							</div>
							<div
								className={`h-max w-max cursor-pointer`}
								onClick={handleCreateNote}
							>
								<LUIThemedIcon
									Icon={PlusIcon}
									color={
										theme === LTHEME.DARK
											? "white"
											: "black"
									}
									weight="regular"
									className={`size-5`}
								/>
							</div>
						</div>
					</div>
					{linkedNotes.map((note) => (
						<div
							key={note.id}
							className={`relative flex h-max w-full items-start gap-x-1`}
						>
							<textarea
								className={`min-h-16 w-full resize-y rounded-lg border p-2 text-sm outline-none ${theme}-thin-scrollbar ${
									theme === LTHEME.DARK
										? "border-neutral-700 bg-neutral-900 text-white focus:border-neutral-500"
										: "border-neutral-300 bg-neutral-100 text-black focus:border-neutral-500"
								}`}
								value={note.content}
								placeholder="Write note..."
								onChange={(event) =>
									handleNoteContentChange(
										note.id,
										event.target.value,
									)
								}
							/>
							<div
								className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg active:scale-95`}
								onClick={() => handleDeleteNote(note)}
							>
								<LUIThemedIcon
									Icon={TrashIcon}
									color={
										theme === LTHEME.DARK
											? "white"
											: "black"
									}
									weight="light"
									className={`size-6`}
								/>
							</div>
						</div>
					))}
				</div>
				{linkedTaskIds.length > 0 ? (
					<LUITaskLinks
						tasks={tasks}
						linkedTaskIds={linkedTaskIds}
						handleUnlinkTask={handleUnlinkTask}
					/>
				) : null}
				{linkedReminderIds.length > 0 ? (
					<LUIReminderLinks
						reminders={reminders}
						linkedReminderIds={linkedReminderIds}
						handleUnlinkReminder={handleUnlinkReminder}
					/>
				) : null}
			</div>
			<div
				className={`flex h-16 w-full items-center justify-center pt-1 pb-2`}
			>
				<LUICUButton
					name="Update"
					onClick={handleUpdateSave}
					passedTheme={theme}
				/>
			</div>
		</div>
	);
};

export { Component as LUIVBMForm };

