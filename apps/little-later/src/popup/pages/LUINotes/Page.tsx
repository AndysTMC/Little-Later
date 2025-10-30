import { useLittleTransition } from "../../hooks/useLittleTransition";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { LNote, LNoteSearchResult } from "little-shared/types";
import { LLINK_TYPE, LTHEME } from "little-shared/enums";
import { NoteBlankIcon, TrashIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { LUISearchBar } from "../../components/LUISearchBar/Component";
import { useTheme } from "../../hooks/useTheme";
import { LUINote } from "../../components/LUINote/Component";
import { useNotes } from "../../hooks/useNotes";
import { createNote, deleteNote, updateNote } from "../../../services/note";
import { LDateUtl } from "little-shared/utils/datetime";
import { fakeWait } from "little-shared/utils/misc";
import { searchNotesByText } from "../../../utils/note";
import { usePagination } from "../../hooks/usePagination";
import { LUIPagination } from "../../components/LUIPagination/Component";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { useLinks } from "../../hooks/useLinks";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideUp,
	});
	const links = useLinks();
	const storedNotes = useNotes();
	const notes = storedNotes?.filter(
		(x) =>
			!(
				links?.some(
					(link) =>
						link.noteId === x.id &&
						link.type === LLINK_TYPE.NOTE_VBM,
				) ?? true
			),
	);
	const loading = useLoading([notes]);
	const [query, setQuery] = useState("");
	const [editNoteId, setEditNoteId] = useState<number | null>(null);
	const { startIndex, endIndex, batchCount, currentBatch, onBatchChange } =
		usePagination(notes?.length ?? 0, 10);
	const paginationNotes = useMemo(() => {
		notes?.sort((a, b) =>
			LDateUtl.from(a.lastModificationDate).lt(b.lastModificationDate)
				? 1
				: -1,
		);
		return notes?.slice(startIndex, endIndex) || [];
	}, [notes, startIndex, endIndex]);
	const searchResults = useMemo<LNoteSearchResult[]>(() => {
		if (notes === undefined || query.trim() === "") {
			return [];
		}
		const words = query.split(" ");
		const results: LNoteSearchResult[] = [];
		for (const word of words) {
			const searchNotes = searchNotesByText(notes, word);
			searchNotes.forEach((result) => {
				const existingResult = results.find(
					(searchResult) => searchResult.data.id === result.id,
				);
				if (!existingResult) {
					results.push({
						data: result,
						noOfMatches: 1,
						totalLengthMatched: word.length,
					});
				} else {
					existingResult.noOfMatches += 1;
					existingResult.totalLengthMatched += word.length;
				}
			});
		}
		results.sort((a, b) => {
			if (a.totalLengthMatched > b.totalLengthMatched) return -1;
			if (a.totalLengthMatched < b.totalLengthMatched) return 1;
			return 0;
		});
		return results;
	}, [notes, query]);
	const {
		startIndex: startIndex2,
		endIndex: endIndex2,
		currentBatch: currentBatch2,
		batchCount: batchCount2,
		onBatchChange: onBatchChange2,
	} = usePagination(searchResults.length, 10);
	const paginationSearchResults = useMemo(() => {
		return searchResults.slice(startIndex2, endIndex2);
	}, [searchResults, startIndex2, endIndex2]);
	const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
	const createNewNote = async () => {
		await createNote({ content: "" });
	};
	const handleUpdateNote = async (modifiedNote: LNote) => {
		await updateNote(modifiedNote.id, modifiedNote);
	};
	const handleDeleteNote = async (noteId: number) => {
		await deleteNote(noteId);
	};
	const handleFocusNote = async (noteId: number) => {
		if (editNoteId === noteId) {
			return;
		}
		setEditNoteId(noteId);
		if (editNoteId !== null) {
			await handleUnFocusNote(editNoteId);
		}
	};
	const handleUnFocusNote = async (noteId: number) => {
		if (editNoteId === noteId) {
			setEditNoteId(null);
			await fakeWait();
			await updateNote(noteId, {
				lastModificationDate: LDateUtl.getNow(),
			});
		}
	};

	return (
		<motion.div
			className={`h-full w-full select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"}`}
			{...entry}
			{...exit}
		>
			{loading ? (
				<LUILoading />
			) : (
				<motion.div
					className={`flex h-full w-full flex-col overflow-y-hidden`}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
				>
					<LUIBasicNav
						navigateTo="/home"
						entryTransition={entryTransitions.slideUp}
					/>
					<div className={`w-full px-5 py-2`}>
						<LUISearchBar
							handleSearch={async (searchQuery) =>
								setQuery(searchQuery)
							}
							setIsSearchFocused={setIsSearchFocused}
						/>
					</div>

					<AnimatePresence mode="wait">
						{isSearchFocused ? (
							<motion.div
								key="search"
								className={`flex w-full grow flex-col gap-y-1 overflow-y-hidden`}
								initial={{ opacity: 0, y: -10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -10 }}
								transition={{ duration: 0.2 }}
							>
								{paginationSearchResults.length > 0 ? (
									<div
										className={`flex w-full flex-col gap-y-1`}
									>
										{batchCount > 1 ? (
											<div className="flex h-max w-full shrink-0 px-4">
												<LUIPagination
													currentBatch={currentBatch2}
													batchCount={batchCount2}
													onBatchChange={
														onBatchChange2
													}
												/>
											</div>
										) : null}

										<div
											className={`flex w-full grow flex-col gap-y-1 overflow-y-auto ${theme}-scrollbar px-4`}
										>
											{paginationSearchResults.map(
												(searchResult, index) => (
													<div
														key={index}
														className={`flex h-max w-full items-start gap-x-2`}
													>
														<LUINote
															key={
																searchResult
																	.data.id
															}
															note={
																searchResult.data
															}
															onNoteChange={
																handleUpdateNote
															}
															editNoteId={
																editNoteId
															}
															focus={
																handleFocusNote
															}
															unFocus={
																handleUnFocusNote
															}
														/>
														<div
															className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg active:scale-95`}
															onClick={() =>
																handleDeleteNote(
																	searchResult
																		.data
																		.id,
																)
															}
														>
															<LUIThemedIcon
																Icon={TrashIcon}
																color={
																	theme ===
																	LTHEME.DARK
																		? "white"
																		: "black"
																}
																weight="light"
																className={`size-6`}
															/>
														</div>
													</div>
												),
											)}
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
								className={`flex h-full w-full flex-col gap-y-1 overflow-y-hidden pb-1`}
								initial={{ opacity: 0, y: -10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -10 }}
								transition={{ duration: 0.2 }}
							>
								<div
									className={`flex h-10 w-full shrink-0 items-end justify-start gap-x-1 px-4`}
								>
									<div
										className={`flex h-full items-center justify-center text-2xl font-extrabold ${
											theme === LTHEME.DARK
												? "text-white"
												: "text-black"
										} leading-none`}
									>
										New Note
									</div>
									<div
										className={`flex h-full w-max cursor-pointer items-center justify-center active:scale-95`}
										onClick={createNewNote}
									>
										<LUIThemedIcon
											Icon={NoteBlankIcon}
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
									className={`flex w-full grow flex-col gap-y-1 overflow-y-auto ${theme}-scrollbar px-4`}
								>
									{paginationNotes.map((note, index) => (
										<div
											key={index}
											className={`flex h-max w-full items-start gap-x-2`}
										>
											<LUINote
												key={note.id}
												note={note}
												onNoteChange={handleUpdateNote}
												editNoteId={editNoteId}
												focus={handleFocusNote}
												unFocus={handleUnFocusNote}
											/>
											<div
												className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg active:scale-95`}
												onClick={() =>
													handleDeleteNote(note.id)
												}
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
							</motion.div>
						)}
					</AnimatePresence>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUINotes };
