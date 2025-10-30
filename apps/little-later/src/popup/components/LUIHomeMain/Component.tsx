import { useContext, useMemo, useState } from "react";
import {
	LHomeSearchResult,
	LVisualBM,
	LReminder,
	LTask,
	LLink,
	LNote,
	LUserProfile,
	LUserSettings,
} from "little-shared/types";
import {
	LHOME_MAIN_CONTENT,
	LHOME_SEARCH_RESULT_TYPE,
	LTHEME,
} from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { AnimatePresence, motion } from "framer-motion";
import { HomeContext } from "../../contexts/Home";
import { useLocation, useOutletContext } from "react-router";
import { LUISearchBar } from "../LUISearchBar/Component";
import { LUIHomeMainNav } from "../LUINavs/LUIHomeMainNav/Component";
import { LUISaveMini } from "../LUISaveMini/Component";
import { LUITaskMini } from "../LUITaskMini/Component";
import { LUIReminderMini } from "../LUIReminderMini/Component";
import { LUIHomeMainFeatureMenu } from "../LUIHomeMainFeatureMenu/Component";
import { LUISaves } from "../LUISaves/Component";
import { LUITasks } from "../LUITasks/Component";
import { LUIReminders } from "../LUIReminders/Component";
import { twMerge } from "tailwind-merge";
import { searchRemindersByText } from "../../../../../../packages/shared/src/utils/reminder";
import { searchTasksByText } from "little-shared/utils/task";
import { searchSavesByText } from "../../../utils/visualBM";
import { entryTransitions } from "../../../route-transitions";
import { usePagination } from "../../hooks/usePagination";
import { LUIPagination } from "../LUIPagination/Component";

const Component = () => {
	const {
		className,
		currentUserProfile,
		userSettings,
		links,
		notes,
		reminders,
		tasks,
		visualBMs,
	}: {
		className?: string;
		currentUserProfile: LUserProfile;
		userSettings: LUserSettings;
		links: Array<LLink>;
		notes: Array<LNote>;
		reminders: Array<LReminder>;
		tasks: Array<LTask>;
		visualBMs: Array<LVisualBM>;
	} = useOutletContext();

	const saves = visualBMs.filter((visualBM) => visualBM.isSaved);
	const location = useLocation();

	const [subEntryTransition] = useState(location.state?.subEntryTransition);

	const { theme } = useTheme();

	const { homeSubNavigation } = useContext(HomeContext);

	const [currentContent, setCurrentContent] = useState<LHOME_MAIN_CONTENT>(
		LHOME_MAIN_CONTENT.SAVES,
	);

	const [searchResults, setSearchResults] = useState<
		Array<LHomeSearchResult>
	>([]);

	const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);

	const [isReady, setIsReady] = useState<boolean>(false);

	const { startIndex, endIndex, currentBatch, batchCount, onBatchChange } =
		usePagination(searchResults.length, 5);

	const handleContentChange = (content: LHOME_MAIN_CONTENT) => {
		setCurrentContent(content);
	};

	const handleSearch = async (text: string): Promise<void> => {
		if (!text) {
			if (searchResults.length !== 0) setSearchResults([]);
			return;
		}

		const words = text.split(" ");
		const results: LHomeSearchResult[] = [];
		for (const word of words) {
			const searchSaves = searchSavesByText(saves, word);
			for (const save of searchSaves) {
				const existingResult = results.find(
					(result) => result.data.id === save.id,
				);
				if (existingResult) {
					existingResult.noOfMatches += 1;
					existingResult.totalLengthMatched += word.length;
				} else {
					results.push({
						data: save,
						noOfMatches: 1,
						totalLengthMatched: word.length,
						type: LHOME_SEARCH_RESULT_TYPE.SAVE,
					});
				}
			}

			const searchTasks = searchTasksByText(tasks, word);
			for (const task of searchTasks) {
				const existingResult = results.find(
					(result) => result.data.id === task.id,
				);
				if (existingResult) {
					existingResult.noOfMatches += 1;
					existingResult.totalLengthMatched += word.length;
				} else {
					results.push({
						data: task,
						noOfMatches: 1,
						totalLengthMatched: word.length,
						type: LHOME_SEARCH_RESULT_TYPE.TASK,
					});
				}
			}

			const searchReminders = searchRemindersByText(reminders, word);
			for (const reminder of searchReminders) {
				const existingResult = results.find(
					(result) => result.data.id === reminder.id,
				);
				if (existingResult) {
					existingResult.noOfMatches += 1;
					existingResult.totalLengthMatched += word.length;
				} else {
					results.push({
						data: reminder,
						noOfMatches: 1,
						totalLengthMatched: word.length,
						type: LHOME_SEARCH_RESULT_TYPE.REMINDER,
					});
				}
			}
		}

		results.sort((a, b) => {
			if (a.totalLengthMatched === b.totalLengthMatched) {
				if (a.noOfMatches === b.noOfMatches) {
					if (a.type === LHOME_SEARCH_RESULT_TYPE.TASK) return -1;
					if (b.type === LHOME_SEARCH_RESULT_TYPE.TASK) return 1;
					if (a.type === LHOME_SEARCH_RESULT_TYPE.SAVE) return -1;
					if (b.type === LHOME_SEARCH_RESULT_TYPE.SAVE) return 1;
					return 0;
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
				{isSearchFocused ? (
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
												<LUISaveMini
													links={links}
													notes={notes}
													reminders={reminders}
													tasks={tasks}
													key={result.data.id}
													save={
														result.data as LVisualBM
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
													reminders={reminders}
													saves={saves}
													key={result.data.id}
													task={result.data as LTask}
												/>
											);
										}
										if (
											result.type ==
											LHOME_SEARCH_RESULT_TYPE.REMINDER
										) {
											return (
												<LUIReminderMini
													links={links}
													saves={saves}
													key={result.data.id}
													reminder={
														result.data as LReminder
													}
												/>
											);
										}
										return null;
									})}
								</div>
							</div>
						) : (
							<div
								className={`flex h-full w-full items-center justify-center text-5xl text-pretty ${theme === LTHEME.DARK ? "text-white" : "text-black"} font-extrabold opacity-10`}
							>
								No results found
							</div>
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
											<LUISaves
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
											/>
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
