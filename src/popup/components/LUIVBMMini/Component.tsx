import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import type { Note, Reminder, Save, Task } from "../../../storage/repositories";
import type { LinkRow } from "../../../storage/schema";
import { linkedTo } from "../../records";
import { useState } from "react";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { AnimatePresence, motion } from "framer-motion";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createToast } from "../../../services/toasts";
import { SafeMarkdownImage, SafeMarkdownLink } from "../../markdownSafety";
import { safeUrlTransform } from "../../markdownUrl";
import { twMerge } from "tailwind-merge";
import { getDomainFromUrl } from "little-shared/utils/misc";
import { LUIWebPreview } from "../LUIWebPreview/Component";
import { LReminderIcon, LTaskIcon } from "../LUIIcons";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LUIGroup } from "../LUIGroup/Component";
import { LUILink } from "../LUILink/Component";
import { useTheme } from "../../hooks/useTheme";
import { useLazySavePreview } from "../../hooks/useSavePreview";
import { send } from "../../../utils/send";
import { attempt } from "../../attempt";
import { pressable } from "../../a11y";
import { LUIDeleteButton } from "../LUIDeleteButton/Component";
import { LUIPillButton } from "../LUIPillButton/Component";
import { LUITagChips } from "../LUITagChips/Component";
import { CaretDownIcon, LockIcon, NoteIcon } from "@phosphor-icons/react";

const Component = ({
	className,
	links,
	notes,
	reminders,
	tasks,
	save,
	disableNavs = false,
	activeTag = null,
	onSelectTag,
}: {
	className?: string;
	links: Array<LinkRow>;
	notes: Array<Note>;
	reminders: Array<Reminder>;
	tasks: Array<Task>;
	save: Save;
	disableNavs?: boolean;
	activeTag?: string | null;
	onSelectTag?: (tag: string) => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const go = useMoveNavigate();
	const [isExpanded, setIsExpanded] = useState(false);
	const linkedTasks = linkedTo(links, save.id, tasks);
	const linkedReminders = linkedTo(links, save.id, reminders);
	const linkedNotes = linkedTo(links, save.id, notes);

	const handleExpand = () => {
		setIsExpanded((open) => !open);
	};
	// Unsaving detaches the page's notes, tasks and reminders.
	const handleEdit = () => {
		if (disableNavs) return;
		go("/vbm/" + save.id, "forward");
	};
	const handleToggleArchive = () => {
		void attempt(
			() =>
				send("save.update", {
					id: save.id,
					archived: !save.archived,
				}),
			save.archived
				? "Couldn't unarchive this save."
				: "Couldn't archive this save.",
		);
	};

	const { preview, elementRef } = useLazySavePreview(save.id);

	return (
		<div
			ref={elementRef}
			className={twMerge(
				`flex h-max w-full flex-col rounded-2xl border transition-colors ${
					isDark
						? "border-neutral-800 bg-neutral-900/70 hover:border-neutral-700"
						: "border-neutral-200 bg-neutral-100/70 hover:border-neutral-300"
				}`,
				className,
			)}
		>
			<div className="flex w-full items-start gap-x-3 p-2.5">
				{!isExpanded ? (
					<LUIWebPreview
						previewBlob={preview}
						saveId={save.id}
						url={save.url}
						scaleType="short"
					/>
				) : null}

				<div className="flex min-w-0 grow flex-col gap-y-1 py-0.5">
					<div
						className="flex min-w-0 cursor-pointer items-start gap-x-2"
						aria-expanded={isExpanded}
						{...pressable(handleExpand)}
					>
						<div className="flex min-w-0 grow flex-col gap-y-1">
							<div
								className={`text-sm leading-snug font-semibold text-pretty break-words ${
									isExpanded ? "" : "line-clamp-2"
								} ${isDark ? "text-neutral-100" : "text-neutral-900"}`}
							>
								{save.customName}
							</div>
							<div
								className={`truncate text-xs ${
									isDark
										? "text-neutral-400"
										: "text-neutral-600"
								}`}
							>
								{getDomainFromUrl(save.url)}
							</div>
						</div>
						<span
							aria-hidden
							className={`mt-0.5 flex size-6 shrink-0 items-center justify-center ${
								isDark ? "text-neutral-500" : "text-neutral-400"
							}`}
						>
							<LUIThemedIcon
								Icon={CaretDownIcon}
								color="currentColor"
								weight="regular"
								className={`size-3.5 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
							/>
						</span>
					</div>
					{(save.tags?.length ?? 0) > 0 ? (
						<LUITagChips
							tags={save.tags ?? []}
							activeTag={activeTag}
							onSelect={onSelectTag}
							className="mt-0.5"
						/>
					) : null}
					{!isExpanded &&
					(linkedTasks.length > 0 ||
						linkedReminders.length > 0 ||
						linkedNotes.length > 0) ? (
						<div
							className={`mt-1 flex items-center gap-x-2.5 text-xs ${
								isDark ? "text-neutral-400" : "text-neutral-600"
							}`}
						>
							{linkedTasks.length > 0 ? (
								<span className="inline-flex items-center gap-x-0.5">
									<LUIThemedIcon
										Icon={LTaskIcon}
										color="currentColor"
										weight="regular"
										className="size-3.5"
									/>
									{linkedTasks.length}
								</span>
							) : null}
							{linkedReminders.length > 0 ? (
								<span className="inline-flex items-center gap-x-0.5">
									<LUIThemedIcon
										Icon={LReminderIcon}
										color="currentColor"
										weight="regular"
										className="size-3.5"
									/>
									{linkedReminders.length}
								</span>
							) : null}
							{linkedNotes.length > 0 ? (
								<span className="inline-flex items-center gap-x-0.5">
									<LUIThemedIcon
										Icon={NoteIcon}
										color="currentColor"
										weight="regular"
										className="size-3.5"
									/>
									{linkedNotes.length}
								</span>
							) : null}
						</div>
					) : null}
				</div>
			</div>

			<AnimatePresence initial={false}>
				{isExpanded ? (
					<motion.div
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.16, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div
							className={`flex flex-col gap-y-2 border-t px-3 pt-2.5 pb-3 ${
								isDark
									? "border-neutral-800"
									: "border-neutral-200"
							}`}
						>
							<LUIWebPreview
								previewBlob={preview}
								saveId={save.id}
								url={save.url}
							/>
							{linkedTasks.length > 0 ? (
								<LUIGroup
									title={`${linkedTasks.length} Task${linkedTasks.length === 1 ? "" : "s"}`}
									headerTextSize="sm"
								>
									{linkedTasks.map((task) => (
										<LUILink
											key={task.id}
											content={task.information}
											navigateTo={"/task/" + task.id}
											hoverBackground={
												isDark
													? "bg-neutral-800"
													: "bg-neutral-200"
											}
											disableNavs={disableNavs}
										/>
									))}
								</LUIGroup>
							) : null}
							{linkedReminders.length > 0 ? (
								<LUIGroup
									title={`${linkedReminders.length} Reminder${linkedReminders.length === 1 ? "" : "s"}`}
									headerTextSize="sm"
								>
									{linkedReminders.map((reminder) => (
										<LUILink
											key={reminder.id}
											content={reminder.message}
											navigateTo={
												"/reminder/" + reminder.id
											}
											hoverBackground={
												isDark
													? "bg-neutral-800"
													: "bg-neutral-200"
											}
											disableNavs={disableNavs}
										/>
									))}
								</LUIGroup>
							) : null}
							{linkedNotes.length > 0 ? (
								<LUIGroup
									title={`${linkedNotes.length} Note${linkedNotes.length === 1 ? "" : "s"}`}
									headerTextSize="sm"
								>
									{linkedNotes.map((note) =>
										note.locked ? (
											<button
												key={note.id}
												type="button"
												disabled={disableNavs}
												onClick={() =>
													!disableNavs &&
													go(
														`/note/${note.id}`,
														"forward",
													)
												}
												className={`my-1 flex w-full cursor-pointer items-center gap-x-2 rounded-xl border p-2.5 text-left text-xs transition-colors disabled:cursor-default ${
													isDark
														? "border-neutral-800 bg-black/40 text-neutral-300 hover:border-neutral-700"
														: "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
												}`}
											>
												<LUIThemedIcon
													Icon={LockIcon}
													color="currentColor"
													weight="fill"
													className="size-3.5 shrink-0 text-[var(--ll-accent)]"
												/>
												<span className="truncate font-medium">
													{note.title ||
														"Locked note"}
												</span>
											</button>
										) : (
											<div
												key={note.id}
												className={`ll-markdown my-1 rounded-xl border p-2.5 text-xs ${
													isDark
														? "border-neutral-800 bg-black/40 text-neutral-200"
														: "border-neutral-200 bg-white text-neutral-800"
												}`}
											>
												<Markdown
													remarkPlugins={[remarkGfm]}
													urlTransform={
														safeUrlTransform
													}
													components={{
														img: SafeMarkdownImage,
														a: SafeMarkdownLink,
													}}
												>
													{note.content}
												</Markdown>
											</div>
										),
									)}
								</LUIGroup>
							) : null}
							<div className="flex w-full flex-wrap items-center gap-1.5 pt-1">
								{!disableNavs ? (
									<LUIPillButton
										label="Edit"
										ariaLabel="Edit save"
										onClick={handleEdit}
									/>
								) : null}
								<LUIPillButton
									label="Copy URL"
									ariaLabel="Copy save URL"
									onClick={() => {
										if (!navigator.clipboard?.writeText)
											return;
										void navigator.clipboard
											.writeText(save.url)
											.then(
												() =>
													createToast(
														"URL copied.",
														LTOAST_TYPE.SUCCESS,
													),
												() =>
													createToast(
														"Couldn't copy URL.",
														LTOAST_TYPE.ERROR,
													),
											);
									}}
								/>
								<LUIPillButton
									label={
										save.archived ? "Unarchive" : "Archive"
									}
									ariaLabel={
										save.archived
											? "Unarchive save"
											: "Archive save"
									}
									onClick={handleToggleArchive}
								/>
								<div className="flex grow justify-end gap-x-1.5">
									<LUIDeleteButton
										onDelete={() =>
											send("save.update", {
												id: save.id,
												saved: false,
											})
										}
										failureMessage="Couldn't remove this save."
									/>
									<LUIPillButton
										label="Collapse"
										onClick={handleExpand}
									/>
								</div>
							</div>
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
};

export { Component as LUIVBMMini };
