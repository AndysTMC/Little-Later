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
import { fakeWait } from "little-shared/utils/misc";
import { LVBMIcon } from "../LUIIcons";
import { LUIReminderLinks } from "../LUIReminderLinks/Component";
import { LUITaskLinks } from "../LUITaskLinks/Component";
import { useSavePreview } from "../../hooks/useSavePreview";
import type { Note, Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { linkedTo } from "../../records";
import { send } from "../../../utils/send";

const MAX_NAME_LENGTH = 64;

// A note being edited: an existing one, or a new one without an id yet.
type DraftNote = { key: string; id: string | null; content: string };

const Component = ({
	className,
	links,
	notes,
	reminders,
	tasks,
	save,
}: {
	className?: string;
	links: Array<LinkRow>;
	notes: Array<Note>;
	reminders: Array<Reminder>;
	tasks: Array<Task>;
	save: Save;
}) => {
	const { theme } = useTheme();
	const preview = useSavePreview(save.id);
	const [customName, setCustomName] = useState(save.customName);

	// Edits stay local until Update, then go out as commands, compared with
	// what is stored then.
	const storedNotes = linkedTo(links, save.id, notes);
	const storedTaskIds = linkedTo(links, save.id, tasks).map(
		(task) => task.id,
	);
	const storedReminderIds = linkedTo(links, save.id, reminders).map(
		(reminder) => reminder.id,
	);
	const [draftNotes, setDraftNotes] = useState<Array<DraftNote>>(() =>
		storedNotes.map((note) => ({
			key: note.id,
			id: note.id,
			content: note.content,
		})),
	);
	const [linkedTaskIds, setLinkedTaskIds] = useState(storedTaskIds);
	const [linkedReminderIds, setLinkedReminderIds] =
		useState(storedReminderIds);

	const validateName = (value: string) =>
		value.length > MAX_NAME_LENGTH
			? { success: false, error: "Name is too long" }
			: { success: true, error: "" };

	const handleCreateNote = () => {
		setDraftNotes((current) => [
			...current,
			{ key: crypto.randomUUID(), id: null, content: "" },
		]);
	};

	const handleNoteContentChange = (key: string, content: string) => {
		setDraftNotes((current) =>
			current.map((note) =>
				note.key === key ? { ...note, content } : note,
			),
		);
	};

	const handleDeleteNote = (key: string) => {
		setDraftNotes((current) => current.filter((note) => note.key !== key));
	};

	const handleUpdateSave = async () => {
		await fakeWait();
		const name = customName.trim();
		if (name !== "" && name !== save.customName) {
			await send("save.update", { id: save.id, customName: name });
		}
		const kept = new Set(draftNotes.map((note) => note.id));
		for (const note of storedNotes) {
			if (!kept.has(note.id)) {
				await send("note.delete", { id: note.id });
			}
		}
		for (const draft of draftNotes) {
			if (draft.content.trim() === "") continue;
			if (draft.id === null) {
				const { id } = await send("note.create", {
					content: draft.content,
					saveId: save.id,
				});
				// Created once: a later Update edits it.
				setDraftNotes((current) =>
					current.map((note) =>
						note.key === draft.key ? { ...note, id } : note,
					),
				);
			} else if (
				draft.content !==
				storedNotes.find((note) => note.id === draft.id)?.content
			) {
				await send("note.update", {
					id: draft.id,
					content: draft.content,
				});
			}
		}
		for (const taskId of storedTaskIds) {
			if (!linkedTaskIds.includes(taskId)) {
				await send("link.delete", { fromId: taskId, toId: save.id });
			}
		}
		for (const reminderId of storedReminderIds) {
			if (!linkedReminderIds.includes(reminderId)) {
				await send("link.delete", {
					fromId: reminderId,
					toId: save.id,
				});
			}
		}
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
					passedValue={customName}
					onChange={setCustomName}
					validate={validateName}
					lengthLimit={MAX_NAME_LENGTH}
				/>
				<LUITextInputT1
					name="URL"
					passedValue={save.url}
					onChange={() => {}}
					validate={() => ({ success: true, error: "" })}
					lengthLimit={256}
					disabled
				/>
				<LUIWebPreview previewBlob={preview} url={save.url} />
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
							<button
								type="button"
								aria-label="Add note"
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
							</button>
						</div>
					</div>
					{draftNotes.map((note) => (
						<div
							key={note.key}
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
										note.key,
										event.target.value,
									)
								}
							/>
							<button
								type="button"
								aria-label="Delete note"
								className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg active:scale-95`}
								onClick={() => handleDeleteNote(note.key)}
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
							</button>
						</div>
					))}
				</div>
				{linkedTaskIds.length > 0 ? (
					<LUITaskLinks
						tasks={tasks}
						linkedTaskIds={linkedTaskIds}
						handleUnlinkTask={(id) =>
							setLinkedTaskIds((ids) =>
								ids.filter((taskId) => taskId !== id),
							)
						}
					/>
				) : null}
				{linkedReminderIds.length > 0 ? (
					<LUIReminderLinks
						reminders={reminders}
						linkedReminderIds={linkedReminderIds}
						handleUnlinkReminder={(id) =>
							setLinkedReminderIds((ids) =>
								ids.filter((reminderId) => reminderId !== id),
							)
						}
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
