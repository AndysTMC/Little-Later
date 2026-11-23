import { useMemo, useRef, useState } from "react";
import { DownloadSimpleIcon, XIcon } from "@phosphor-icons/react";
import {
	LHOME_MAIN_CONTENT,
	LHOME_SEARCH_RESULT_TYPE,
	LTHEME,
} from "little-shared/enums";
import type {
	ImageRecord,
	Note,
	Reminder,
	Save,
	Task,
} from "../../../storage/repositories";
import {
	searchImages,
	searchNotes,
	searchReminders,
	searchSaves,
	searchTasks,
	type HomeData,
} from "../../records";
import { useTheme } from "../../hooks/useTheme";
import { AnimatePresence, motion } from "framer-motion";
import { useOutletContext } from "react-router";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { LUISearchBar, type SearchBarHandle } from "../LUISearchBar/Component";
import { LUIHomeMainNav } from "../LUINavs/LUIHomeMainNav/Component";
import { LUIVBMMini } from "../LUIVBMMini/Component";
import { LUITaskMini } from "../LUITaskMini/Component";
import { LUIReminderMini } from "../LUIReminderMini/Component";
import { LUIHomeMainFeatureMenu } from "../LUIHomeMainFeatureMenu/Component";
import { LUIVBMs } from "../LUIVBMs/Component";
import { LUITasks } from "../LUITasks/Component";
import { LUIReminders } from "../LUIReminders/Component";
import { twMerge } from "tailwind-merge";
import { usePagination } from "../../hooks/usePagination";
import { LUIPagination } from "../LUIPagination/Component";
import { LUINotes } from "../LUINotes/Component";
import { LUINoteMini } from "../LUINoteMini/Component";
import { LUIImageMini, LUIImages } from "../LUIImages/Component";
import { LUIEmptyState } from "../LUIEmptyState/Component";
import { LUIPillButton } from "../LUIPillButton/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useDraft } from "../../hooks/useDraft";

type SearchResult = {
	noOfMatches: number;
	totalLengthMatched: number;
} & (
	| { type: LHOME_SEARCH_RESULT_TYPE.SAVE; data: Save }
	| { type: LHOME_SEARCH_RESULT_TYPE.TASK; data: Task }
	| { type: LHOME_SEARCH_RESULT_TYPE.REMINDER; data: Reminder }
	| { type: LHOME_SEARCH_RESULT_TYPE.NOTE; data: Note }
	| { type: LHOME_SEARCH_RESULT_TYPE.IMAGE; data: ImageRecord }
);

const Component = ({ className }: { className?: string }) => {
	const {
		currentUserProfile,
		userSettings,
		links,
		notes,
		images,
		reminders,
		tasks,
		pages,
		ready: isReady,
		navHidden = false,
		showNav,
	} = useOutletContext<HomeData>();

	const saves = useMemo(() => pages.filter((page) => page.saved), [pages]);
	// Notes attached to a save show with that save.
	const unlinkedNotes = useMemo(() => {
		const attached = new Set(links.map((link) => link.fromId));
		return notes.filter((note) => !attached.has(note.id));
	}, [links, notes]);
	const go = useMoveNavigate();

	const { theme } = useTheme();

	const [currentContent, setCurrentContent] = useDraft<LHOME_MAIN_CONTENT>(
		"home.tab",
		userSettings.misc.defaultHomeTab ?? LHOME_MAIN_CONTENT.SAVES,
	);
	const [backupDismissed, setBackupDismissed] = useState(false);
	const backupReminderDays = userSettings.misc.backupReminderDays ?? 0;
	const lastBackupAt = userSettings.misc.lastBackupAt ?? 0;
	const [mountedAt] = useState(() => Date.now());
	const showBackupReminder =
		!backupDismissed &&
		backupReminderDays > 0 &&
		(lastBackupAt === 0 ||
			mountedAt - lastBackupAt >= backupReminderDays * 86_400_000);

	const [searchQuery, setSearchQuery] = useState("");
	const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
	const searchBarRef = useRef<SearchBarHandle | null>(null);

	const searchByTag = (tag: string) => {
		searchBarRef.current?.setQuery(`#${tag}`);
	};

	const activeSearchTag = useMemo(() => {
		const match = /^#([a-z0-9-]+)$/i.exec(searchQuery.trim());
		return match ? match[1].toLowerCase() : null;
	}, [searchQuery]);

	const searchResults = useMemo((): Array<SearchResult> => {
		const query = searchQuery.trim();
		if (!query) return [];

		const words = query.split(/\s+/);
		const results: Array<SearchResult> = [];
		const count = (
			type: LHOME_SEARCH_RESULT_TYPE,
			id: string,
			word: string,
		) => {
			const existing = results.find(
				(result) => result.type === type && result.data.id === id,
			);
			if (existing) {
				existing.noOfMatches += 1;
				existing.totalLengthMatched += word.length;
			}
			return existing !== undefined;
		};
		for (const word of words) {
			for (const save of searchSaves(saves, word)) {
				if (!count(LHOME_SEARCH_RESULT_TYPE.SAVE, save.id, word)) {
					results.push({
						type: LHOME_SEARCH_RESULT_TYPE.SAVE,
						data: save,
						noOfMatches: 1,
						totalLengthMatched: word.length,
					});
				}
			}
			for (const task of searchTasks(tasks, word)) {
				if (!count(LHOME_SEARCH_RESULT_TYPE.TASK, task.id, word)) {
					results.push({
						type: LHOME_SEARCH_RESULT_TYPE.TASK,
						data: task,
						noOfMatches: 1,
						totalLengthMatched: word.length,
					});
				}
			}
			for (const reminder of searchReminders(reminders, word)) {
				if (
					!count(LHOME_SEARCH_RESULT_TYPE.REMINDER, reminder.id, word)
				) {
					results.push({
						type: LHOME_SEARCH_RESULT_TYPE.REMINDER,
						data: reminder,
						noOfMatches: 1,
						totalLengthMatched: word.length,
					});
				}
			}
			for (const note of searchNotes(notes, word)) {
				if (!count(LHOME_SEARCH_RESULT_TYPE.NOTE, note.id, word)) {
					results.push({
						type: LHOME_SEARCH_RESULT_TYPE.NOTE,
						data: note,
						noOfMatches: 1,
						totalLengthMatched: word.length,
					});
				}
			}
			for (const image of searchImages(images, word)) {
				if (!count(LHOME_SEARCH_RESULT_TYPE.IMAGE, image.id, word)) {
					results.push({
						type: LHOME_SEARCH_RESULT_TYPE.IMAGE,
						data: image,
						noOfMatches: 1,
						totalLengthMatched: word.length,
					});
				}
			}
		}

		results.sort((a, b) => {
			if (a.totalLengthMatched === b.totalLengthMatched) {
				if (a.noOfMatches === b.noOfMatches) {
					const priority = {
						[LHOME_SEARCH_RESULT_TYPE.TASK]: 0,
						[LHOME_SEARCH_RESULT_TYPE.SAVE]: 1,
						[LHOME_SEARCH_RESULT_TYPE.REMINDER]: 2,
						[LHOME_SEARCH_RESULT_TYPE.NOTE]: 3,
						[LHOME_SEARCH_RESULT_TYPE.IMAGE]: 4,
					};
					return priority[a.type] - priority[b.type];
				}
				return b.noOfMatches - a.noOfMatches;
			}
			return b.totalLengthMatched - a.totalLengthMatched;
		});
		return results;
	}, [searchQuery, saves, tasks, reminders, notes, images]);

	const { startIndex, endIndex, currentBatch, batchCount, onBatchChange } =
		usePagination(searchResults.length, 20);

	const handleContentChange = (content: LHOME_MAIN_CONTENT) => {
		setCurrentContent(content);
		showNav?.();
	};

	const handleSearch = async (text: string): Promise<void> => {
		setSearchQuery(text.trim());
		onBatchChange(1);
		showNav?.();
	};

	const paginationSearchResults = useMemo(
		() => searchResults.slice(startIndex, endIndex),
		[searchResults, startIndex, endIndex],
	);

	return (
		<div
			className={twMerge(
				`relative flex h-full w-full flex-col select-none`,
				className,
			)}
		>
			<LUIHomeMainNav
				currentUserProfile={currentUserProfile}
				aiSettings={userSettings.ai}
			/>
			<div className="mx-auto w-full max-w-3xl px-4 py-2">
				<LUISearchBar
					handleSearch={handleSearch}
					setIsSearchFocused={setIsSearchFocused}
					searchBarRef={searchBarRef}
				/>
			</div>

			<AnimatePresence mode="wait">
				{isSearchFocused && searchQuery !== "" ? (
					<motion.div
						key="search"
						className={`flex min-h-0 w-full grow flex-col gap-y-1 overflow-y-hidden ${theme}-scrollbar`}
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
					>
						{paginationSearchResults.length > 0 ? (
							<div className="flex min-h-0 w-full grow flex-col gap-y-1 overflow-y-hidden">
								<div className="mx-auto flex h-max w-full max-w-3xl shrink-0 items-center justify-between gap-x-2 px-4 py-1">
									<span
										className={`text-xs font-medium ${
											theme === LTHEME.DARK
												? "text-neutral-400"
												: "text-neutral-500"
										}`}
									>
										{searchResults.length}{" "}
										{searchResults.length === 1
											? "result"
											: "results"}
									</span>
									{batchCount > 1 ? (
										<LUIPagination
											currentBatch={currentBatch}
											batchCount={batchCount}
											onBatchChange={onBatchChange}
										/>
									) : null}
								</div>

								<div
									className={`w-full grow overflow-y-auto ${theme}-scrollbar px-4 pb-24`}
								>
									<div className="mx-auto flex w-full max-w-3xl flex-col gap-y-2">
										{paginationSearchResults.map(
											(result) => {
												if (
													result.type ===
													LHOME_SEARCH_RESULT_TYPE.SAVE
												) {
													return (
														<LUIVBMMini
															links={links}
															notes={notes}
															reminders={
																reminders
															}
															tasks={tasks}
															key={`${result.type}-${result.data.id}`}
															save={result.data}
															activeTag={
																activeSearchTag
															}
															onSelectTag={
																searchByTag
															}
														/>
													);
												}
												if (
													result.type ===
													LHOME_SEARCH_RESULT_TYPE.TASK
												) {
													return (
														<LUITaskMini
															links={links}
															reminders={
																reminders
															}
															saves={saves}
															key={`${result.type}-${result.data.id}`}
															task={result.data}
															activeTag={
																activeSearchTag
															}
															onSelectTag={
																searchByTag
															}
														/>
													);
												}
												if (
													result.type ===
													LHOME_SEARCH_RESULT_TYPE.REMINDER
												) {
													return (
														<LUIReminderMini
															links={links}
															saves={saves}
															tasks={tasks}
															key={`${result.type}-${result.data.id}`}
															reminder={
																result.data
															}
															activeTag={
																activeSearchTag
															}
															onSelectTag={
																searchByTag
															}
														/>
													);
												}
												if (
													result.type ===
													LHOME_SEARCH_RESULT_TYPE.NOTE
												) {
													return (
														<LUINoteMini
															key={`${result.type}-${result.data.id}`}
															className="break-inside-auto"
															note={result.data}
															onOpen={(note) =>
																go(
																	`/note/${note.id}`,
																	"forward",
																)
															}
															showDelete={false}
															activeTag={
																activeSearchTag
															}
															onSelectTag={
																searchByTag
															}
														/>
													);
												}
												if (
													result.type ===
													LHOME_SEARCH_RESULT_TYPE.IMAGE
												) {
													return (
														<LUIImageMini
															key={`${result.type}-${result.data.id}`}
															image={result.data}
															onOpen={(image) =>
																go(
																	`/image/${image.id}`,
																	"forward",
																)
															}
															showDelete={false}
															activeTag={
																activeSearchTag
															}
															onSelectTag={
																searchByTag
															}
														/>
													);
												}
												return null;
											},
										)}
									</div>
								</div>
							</div>
						) : (
							<LUIEmptyState title="No results found" />
						)}
					</motion.div>
				) : (
					<motion.div
						key="main"
						className="flex w-full grow flex-col gap-y-1 overflow-y-hidden"
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
					>
						<div className="mx-auto w-full max-w-3xl">
							<LUIHomeMainFeatureMenu
								currentContent={currentContent}
								handleContentChange={handleContentChange}
							/>
						</div>
						{isReady ? (
							<div className="w-full grow overflow-y-hidden">
								<AnimatePresence mode="wait">
									{currentContent ===
										LHOME_MAIN_CONTENT.SAVES && (
										<motion.div
											key={LHOME_MAIN_CONTENT.SAVES}
											className={`flex h-full w-full flex-col ${
												theme === LTHEME.DARK
													? "bg-black"
													: "bg-white"
											}`}
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											transition={{ duration: 0.2 }}
										>
											<LUIVBMs
												links={links}
												notes={notes}
												reminders={reminders}
												saves={saves}
												tasks={tasks}
												onSelectTag={searchByTag}
											/>
										</motion.div>
									)}
									{currentContent ===
										LHOME_MAIN_CONTENT.TASKS && (
										<motion.div
											key={LHOME_MAIN_CONTENT.TASKS}
											className={`flex h-full w-full flex-col ${
												theme === LTHEME.DARK
													? "bg-black"
													: "bg-white"
											}`}
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											transition={{ duration: 0.2 }}
										>
											<LUITasks
												links={links}
												reminders={reminders}
												saves={saves}
												tasks={tasks}
												onSelectTag={searchByTag}
											/>
										</motion.div>
									)}
									{currentContent ===
										LHOME_MAIN_CONTENT.REMINDERS && (
										<motion.div
											key={LHOME_MAIN_CONTENT.REMINDERS}
											className={`flex h-full w-full flex-col ${
												theme === LTHEME.DARK
													? "bg-black"
													: "bg-white"
											}`}
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											transition={{ duration: 0.2 }}
										>
											<LUIReminders
												links={links}
												reminders={reminders}
												saves={saves}
												tasks={tasks}
												onSelectTag={searchByTag}
											/>
										</motion.div>
									)}
									{currentContent ===
										LHOME_MAIN_CONTENT.NOTES && (
										<motion.div
											key={LHOME_MAIN_CONTENT.NOTES}
											className={`flex h-full w-full flex-col ${
												theme === LTHEME.DARK
													? "bg-black"
													: "bg-white"
											}`}
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											transition={{ duration: 0.2 }}
										>
											<LUINotes
												notes={unlinkedNotes}
												onSelectTag={searchByTag}
											/>
										</motion.div>
									)}
									{currentContent ===
										LHOME_MAIN_CONTENT.IMAGES && (
										<motion.div
											key={LHOME_MAIN_CONTENT.IMAGES}
											className={`flex h-full w-full flex-col ${
												theme === LTHEME.DARK
													? "bg-black"
													: "bg-white"
											}`}
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											transition={{ duration: 0.2 }}
										>
											<LUIImages
												images={images}
												onSelectTag={searchByTag}
											/>
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						) : null}
					</motion.div>
				)}
			</AnimatePresence>
			{showBackupReminder ? (
				<div
					role="status"
					className={`absolute inset-x-0 bottom-16 z-10 border-t px-4 py-2 backdrop-blur-xs transition-transform duration-200 ease-out ${
						navHidden
							? "pointer-events-none translate-y-[calc(100%+4rem)]"
							: "translate-y-0"
					} ${
						theme === LTHEME.DARK
							? "border-neutral-800 bg-neutral-950/95 text-neutral-300"
							: "border-neutral-200 bg-neutral-50/95 text-neutral-700"
					}`}
				>
					<div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-x-2">
						<div className="flex min-w-0 items-center gap-x-2 text-xs">
							<LUIThemedIcon
								Icon={DownloadSimpleIcon}
								color="currentColor"
								weight="regular"
								className="size-4 shrink-0 opacity-70"
							/>
							<span className="truncate">
								{lastBackupAt === 0
									? "Back up your vault"
									: `Backup overdue (${backupReminderDays}d+)`}
							</span>
						</div>
						<div className="flex shrink-0 items-center gap-x-1.5">
							<LUIPillButton
								label="Export"
								onClick={() =>
									go("/export", "forward", {
										state: { referrer: "/home" },
									})
								}
							/>
							<button
								type="button"
								aria-label="Dismiss backup reminder"
								onClick={() => setBackupDismissed(true)}
								className={`flex size-6 cursor-pointer items-center justify-center rounded-full transition-colors ${
									theme === LTHEME.DARK
										? "text-neutral-400 hover:bg-neutral-800 hover:text-white"
										: "text-neutral-500 hover:bg-neutral-200 hover:text-black"
								}`}
							>
								<LUIThemedIcon
									Icon={XIcon}
									color="currentColor"
									weight="regular"
									className="size-3.5"
								/>
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
};

export { Component as LUIHomeMain };
