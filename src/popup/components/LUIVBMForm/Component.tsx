import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import {
	CaretDownIcon,
	CaretUpIcon,
	CheckIcon,
	CopyIcon,
	LockIcon,
	PlusIcon,
	XIcon,
} from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";
import { useEffect, useRef, useState } from "react";
import { createToast } from "../../../services/toasts";
import { useTheme } from "../../hooks/useTheme";
import { LUIFeaturePageUD } from "../LUIFeaturePageUD/Component";
import { LUITextInputT1 } from "../LUITextInput/Component";
import { LUIWebPreview } from "../LUIWebPreview/Component";
import { LUICUButton } from "../LUICUButton/Component";
import { LVBMIcon } from "../LUIIcons";
import { LUIReminderLinks } from "../LUIReminderLinks/Component";
import { LUITaskLinks } from "../LUITaskLinks/Component";
import { LUITagInput } from "../LUITagInput/Component";
import { useSavePreview } from "../../hooks/useSavePreview";
import type { Note, Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { linkedTo } from "../../records";
import { send } from "../../../utils/send";
import { sameTags } from "../../../utils/tags";
import { attempt } from "../../attempt";

const MAX_NAME_LENGTH = 64;
const NO_TAGS: Array<string> = [];

// A note being edited: an existing one, or a new one without an id yet.
type DraftNote = { key: string; id: string | null; content: string };

const Component = ({
	className,
	links,
	notes,
	reminders,
	tasks,
	save,
	tagSuggestions = NO_TAGS,
}: {
	className?: string;
	links: Array<LinkRow>;
	notes: Array<Note>;
	reminders: Array<Reminder>;
	tasks: Array<Task>;
	save: Save;
	tagSuggestions?: ReadonlyArray<string>;
}) => {
	const { theme } = useTheme();
	const preview = useSavePreview(save.id);
	const [customName, setCustomName] = useState(save.customName);
	const [tags, setTags] = useState<Array<string>>(() => [
		...(save.tags ?? []),
	]);
	const [snapshotOpen, setSnapshotOpen] = useState(false);
	const [copiedSnapshot, setCopiedSnapshot] = useState(false);
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (copyTimerRef.current !== null) {
				clearTimeout(copyTimerRef.current);
			}
		};
	}, []);

	// Edits stay local until Update, then go out as commands, compared with
	// what is stored then. Locked notes stay out of inline textareas so
	// their text is never revealed or overwritten without a password.
	const allLinkedNotes = linkedTo(links, save.id, notes);
	const storedNotes = allLinkedNotes.filter((note) => !note.locked);
	const lockedNotes = allLinkedNotes.filter((note) => note.locked);
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

	const validateName = (value: string) => {
		const trimmed = value.trim();
		if (trimmed === "") {
			return { success: false, error: "Name cannot be empty" };
		}
		if (trimmed.length > MAX_NAME_LENGTH) {
			return { success: false, error: "Name is too long" };
		}
		return { success: true, error: "" };
	};

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
		const name = customName.trim();
		if (name === "" || name.length > MAX_NAME_LENGTH) {
			return;
		}
		await attempt(async () => {
			const nameChanged = name !== save.customName;
			const tagsChanged = !sameTags(tags, save.tags ?? []);
			if (nameChanged || tagsChanged) {
				await send("save.update", {
					id: save.id,
					...(nameChanged ? { customName: name } : {}),
					...(tagsChanged ? { tags } : {}),
				});
			}
			const kept = new Set(draftNotes.map((note) => note.id));
			for (const note of storedNotes) {
				if (!kept.has(note.id)) {
					const linkCount = links.filter(
						(link) => link.fromId === note.id,
					).length;
					// Unlink shared notes rather than deleting them from other saves.
					if (linkCount > 1) {
						await send("link.delete", {
							fromId: note.id,
							toId: save.id,
						});
					} else {
						await send("note.delete", { id: note.id });
					}
				}
			}
			for (const draft of draftNotes) {
				if (draft.content.trim() === "") continue;
				if (draft.id === null) {
					const { id } = await send("note.create", {
						content: draft.content,
						saveIds: [save.id],
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
					await send("link.delete", {
						fromId: taskId,
						toId: save.id,
					});
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
			await createToast("Save updated.", LTOAST_TYPE.SUCCESS);
		}, "Couldn't update this save.");
	};

	return (
		<div
			className={twMerge(
				`flex w-full grow flex-col overflow-y-hidden`,
				className,
			)}
		>
			<LUIFeaturePageUD Icon={LVBMIcon} title="Edit save" />
			<div
				className={`w-full grow overflow-y-auto ${theme}-scrollbar px-4 py-4`}
			>
				<div className="mx-auto flex w-full max-w-2xl flex-col gap-y-1">
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
						lengthLimit={2048}
						disableLengthCounter
						disabled
					/>
					<LUIWebPreview
						previewBlob={preview}
						saveId={save.id}
						url={save.url}
					/>
					<LUITagInput
						tags={tags}
						onChange={setTags}
						suggestions={tagSuggestions}
					/>
					{save.snapshot ? (
						<div
							className={`my-1 flex flex-col rounded-xl border ${
								theme === LTHEME.DARK
									? "border-neutral-800 bg-neutral-900/70"
									: "border-neutral-200 bg-neutral-100/70"
							}`}
						>
							<div className="flex items-center justify-between gap-x-2 px-3 py-2">
								<button
									type="button"
									aria-expanded={snapshotOpen}
									onClick={() =>
										setSnapshotOpen((open) => !open)
									}
									className={`flex min-w-0 grow cursor-pointer items-center gap-x-1.5 text-left text-xs font-medium ${
										theme === LTHEME.DARK
											? "text-neutral-200"
											: "text-neutral-800"
									}`}
								>
									<LUIThemedIcon
										Icon={
											snapshotOpen
												? CaretUpIcon
												: CaretDownIcon
										}
										color="currentColor"
										weight="regular"
										className="size-3 shrink-0"
									/>
									<span className="truncate">
										Offline article snapshot
									</span>
									<span
										className={`shrink-0 text-[11px] font-normal ${
											theme === LTHEME.DARK
												? "text-neutral-400"
												: "text-neutral-500"
										}`}
									>
										({save.snapshot.length.toLocaleString()}{" "}
										chars)
									</span>
								</button>
								<button
									type="button"
									aria-label="Copy article snapshot"
									onClick={() => {
										if (!navigator.clipboard?.writeText) {
											void createToast(
												"Clipboard is unavailable.",
												LTOAST_TYPE.ERROR,
											);
											return;
										}
										void navigator.clipboard
											.writeText(save.snapshot ?? "")
											.then(
												() => {
													setCopiedSnapshot(true);
													if (
														copyTimerRef.current !==
														null
													) {
														clearTimeout(
															copyTimerRef.current,
														);
													}
													copyTimerRef.current =
														setTimeout(() => {
															copyTimerRef.current =
																null;
															setCopiedSnapshot(
																false,
															);
														}, 1500);
												},
												() => {
													void createToast(
														"Couldn't copy snapshot.",
														LTOAST_TYPE.ERROR,
													);
												},
											);
									}}
									className={`inline-flex shrink-0 cursor-pointer items-center gap-x-1 rounded-lg px-2 py-0.5 text-[11px] font-medium transition-colors ${
										theme === LTHEME.DARK
											? "text-neutral-300 hover:bg-neutral-800"
											: "text-neutral-700 hover:bg-neutral-200"
									}`}
								>
									<LUIThemedIcon
										Icon={
											copiedSnapshot
												? CheckIcon
												: CopyIcon
										}
										color="currentColor"
										weight="regular"
										className="size-3"
									/>
									<span>
										{copiedSnapshot ? "Copied" : "Copy"}
									</span>
								</button>
							</div>
							{snapshotOpen ? (
								<div
									className={`max-h-56 overflow-y-auto border-t px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap select-text ${
										theme === LTHEME.DARK
											? "border-neutral-800 text-neutral-300"
											: "border-neutral-200 text-neutral-700"
									}`}
								>
									{save.snapshot}
								</div>
							) : null}
						</div>
					) : null}
					{lockedNotes.length > 0 ? (
						<div className="my-1 flex flex-col gap-y-1">
							{lockedNotes.map((note) => (
								<div
									key={note.id}
									className={`flex items-center gap-x-2 rounded-xl border px-3 py-2 text-xs ${
										theme === LTHEME.DARK
											? "border-neutral-800 bg-neutral-900/70 text-neutral-400"
											: "border-neutral-200 bg-neutral-100/70 text-neutral-600"
									}`}
								>
									<LUIThemedIcon
										Icon={LockIcon}
										color="currentColor"
										weight="fill"
										className="size-3.5 shrink-0 text-[var(--ll-accent)]"
									/>
									<span className="truncate">
										{note.title || "Locked note"} (edit in
										Notes)
									</span>
								</div>
							))}
						</div>
					) : null}
					<div className="my-1 flex h-max w-full flex-col gap-y-1.5">
						<div className="flex h-max w-full items-center justify-between gap-x-2">
							<span
								className={`text-xs font-medium ${
									theme === LTHEME.DARK
										? "text-neutral-400"
										: "text-neutral-600"
								}`}
							>
								Notes
							</span>
							<button
								type="button"
								aria-label="Add note"
								className={`flex cursor-pointer items-center gap-x-1 rounded-lg border px-2 py-0.5 text-xs font-medium transition-colors ${
									theme === LTHEME.DARK
										? "border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
										: "border-neutral-200 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
								}`}
								onClick={handleCreateNote}
							>
								<LUIThemedIcon
									Icon={PlusIcon}
									color="currentColor"
									weight="regular"
									className="size-3.5"
								/>
								<span>Add</span>
							</button>
						</div>
						{draftNotes.map((note) => (
							<div
								key={note.key}
								className="relative flex h-max w-full items-start gap-x-1.5"
							>
								<textarea
									aria-label="Note content"
									className={`min-h-16 w-full resize-y rounded-xl border px-3 py-2 text-sm transition-colors ${theme}-thin-scrollbar ${
										theme === LTHEME.DARK
											? "border-neutral-700 bg-neutral-900 text-neutral-100 focus:border-neutral-400"
											: "border-neutral-300 bg-white text-neutral-900 focus:border-neutral-600"
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
									className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors active:scale-95 ${
										theme === LTHEME.DARK
											? "text-neutral-400 hover:bg-neutral-800 hover:text-red-400"
											: "text-neutral-500 hover:bg-neutral-100 hover:text-red-600"
									}`}
									onClick={() => handleDeleteNote(note.key)}
								>
									<LUIThemedIcon
										Icon={XIcon}
										color="currentColor"
										weight="regular"
										className="size-4"
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
									ids.filter(
										(reminderId) => reminderId !== id,
									),
								)
							}
						/>
					) : null}
				</div>
			</div>
			<div className="flex h-16 w-full items-center justify-center px-4 pt-1 pb-2">
				<LUICUButton
					name="Update"
					onClick={handleUpdateSave}
					passedTheme={theme}
					disabled={!validateName(customName).success}
				/>
			</div>
		</div>
	);
};

export { Component as LUIVBMForm };
