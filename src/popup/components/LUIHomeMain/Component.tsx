import { useContext, useMemo, useState } from "react";
import {
	LHOME_MAIN_CONTENT,
	LHOME_SEARCH_RESULT_TYPE,
	LTHEME,
} from "little-shared/enums";
import type { Note, Reminder, Save, Task } from "../../../storage/repositories";
import {
	searchNotes,
	searchReminders,
	searchSaves,
	searchTasks,
	type HomeData,
} from "../../records";
import { useTheme } from "../../hooks/useTheme";
import { AnimatePresence, motion } from "framer-motion";
import { HomeContext } from "../../contexts/Home";
import { useLocation, useNavigate, useOutletContext } from "react-router";
import { LUISearchBar } from "../LUISearchBar/Component";
import { LUIHomeMainNav } from "../LUINavs/LUIHomeMainNav/Component";
import { LUIVBMMini } from "../LUIVBMMini/Component";
import { LUITaskMini } from "../LUITaskMini/Component";
import { LUIReminderMini } from "../LUIReminderMini/Component";
import { LUIHomeMainFeatureMenu } from "../LUIHomeMainFeatureMenu/Component";
import { LUIVBMs } from "../LUIVBMs/Component";
import { LUITasks } from "../LUITasks/Component";
import { LUIReminders } from "../LUIReminders/Component";
import { twMerge } from "tailwind-merge";
import { entryTransitions } from "../../../route-transitions";
import { usePagination } from "../../hooks/usePagination";
import { LUIPagination } from "../LUIPagination/Component";
import { LUINotes } from "../LUINotes/Component";
import { LUINoteMini } from "../LUINoteMini/Component";
import { LUIEmptyState } from "../LUIEmptyState/Component";

type SearchResult = {
	noOfMatches: number;
	totalLengthMatched: number;
} & (
	| { type: LHOME_SEARCH_RESULT_TYPE.SAVE; data: Save }
	| { type: LHOME_SEARCH_RESULT_TYPE.TASK; data: Task }
	| { type: LHOME_SEARCH_RESULT_TYPE.REMINDER; data: Reminder }
	| { type: LHOME_SEARCH_RESULT_TYPE.NOTE; data: Note }
);

const Component = ({ className }: { className?: string }) => {
	const {
		currentUserProfile,
		userSettings,
		links,
		notes,
		reminders,
		tasks,
		pages,
	} = useOutletContext<HomeData>();

	const saves = useMemo(() => pages.filter((page) => page.saved), [pages]);
	// Notes attached to a save show with that save.
	const unlinkedNotes = useMemo(() => {
		const attached = new Set(links.map((link) => link.fromId));
		return notes.filter((note) => !attached.has(note.id));
	}, [links, notes]);
	const location = useLocation();
	const navigate = useNavigate();

	const [subEntryTransition] = useState(location.state?.subEntryTransition);

	const { theme } = useTheme();

	const { homeSubNavigation } = useContext(HomeContext);

	const [currentContent, setCurrentContent] = useState<LHOME_MAIN_CONTENT>(
		LHOME_MAIN_CONTENT.SAVES,
	);

	const [searchResults, setSearchResults] = useState<Array<SearchResult>>([]);

	const [searchQuery, setSearchQuery] = useState("");

	const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);

	const [isReady, setIsReady] = useState<boolean>(false);

	const { startIndex, endIndex, currentBatch, batchCount, onBatchChange } =
		usePagination(searchResults.length, 5);

	const handleContentChange = (content: LHOME_MAIN_CONTENT) => {
		setCurrentContent(content);
	};

	const handleSearch = async (text: string): Promise<void> => {
		const query = text.trim();
		setSearchQuery(query);
		if (!query) {
			if (searchResults.length !== 0) setSearchResults([]);
			return;
		}

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
		}

		results.sort((a, b) => {
			if (a.totalLengthMatched === b.totalLengthMatched) {
				if (a.noOfMatches === b.noOfMatches) {
					const priority = {
						[LHOME_SEARCH_RESULT_TYPE.TASK]: 0,
						[LHOME_SEARCH_RESULT_TYPE.SAVE]: 1,
						[LHOME_SEARCH_RESULT_TYPE.REMINDER]: 2,
						[LHOME_SEARCH_RESULT_TYPE.NOTE]: 3,
					};
					return priority[a.type] - priority[b.type];
				}
				return b.noOfMatches - a.noOfMatches;
			}
			return b.totalLengthMatched - a.totalLengthMatched;
		});
		setSearchResults(results);
		onBatchChange(1);
	};

	const paginationSearchResults = useMemo(
		() => searchResults.slice(startIndex, endIndex),
		[searchResults, startIndex, endIndex],
	);

	return (
		<motion.div
			className={twMerge(
				`relative flex h-full w-full flex-col select-none`,
				className,
			)}
			{...(subEntryTransition ?? entryTransitions.fade)}
			{...homeSubNavigation.exit}
			onAnimationComplete={() => setIsReady(true)}
		>
			<LUIHomeMainNav
				currentUserProfile={currentUserProfile}
				aiSettings={userSettings.ai}
			/>
			<div className={`w-full px-5 py-2`}>
				<LUISearchBar
					handleSearch={handleSearch}
					setIsSearchFocused={setIsSearchFocused}
				/>
			</div>

			<AnimatePresence mode="wait">
				{isSearchFocused && searchQuery !== "" ? (
					<motion.div
						key="search"
						className={`flex w-full grow flex-col gap-y-1 overflow-y-hidden ${theme}-scrollbar`}
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
					>
						{paginationSearchResults.length > 0 ? (
							<div
								className={`flex w-full flex-col gap-y-1 overflow-y-hidden`}
							>
								{batchCount > 1 ? (
									<div className="flex h-max w-full shrink-0 px-4 py-1">
										<LUIPagination
											currentBatch={currentBatch}
											batchCount={batchCount}
											onBatchChange={onBatchChange}
										/>
									</div>
								) : null}

								<div
									className={`flex w-full grow flex-col gap-y-1 overflow-y-auto ${theme}-scrollbar px-5 pb-1`}
								>
									{paginationSearchResults.map((result) => {
										if (
											result.type ===
											LHOME_SEARCH_RESULT_TYPE.SAVE
										) {
											return (
												<LUIVBMMini
													links={links}
													notes={notes}
													reminders={reminders}
													tasks={tasks}
													key={`${result.type}-${result.data.id}`}
													save={result.data}
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
													reminders={reminders}
													saves={saves}
													key={`${result.type}-${result.data.id}`}
													task={result.data}
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
													reminder={result.data}
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
														navigate(
															`/note/${note.id}`,
														)
													}
													showDelete={false}
												/>
											);
										}
										return null;
									})}
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
						<LUIHomeMainFeatureMenu
							currentContent={currentContent}
							handleContentChange={handleContentChange}
						/>
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
											<LUINotes notes={unlinkedNotes} />
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						) : null}
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
};

export { Component as LUIHomeMain };
