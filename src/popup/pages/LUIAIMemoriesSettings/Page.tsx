import { useState } from "react";
import { motion } from "framer-motion";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import type { LAIMemory } from "little-shared/types";
import { send } from "../../../utils/send";
import { attempt } from "../../attempt";
import { useTheme } from "../../hooks/useTheme";
import { usePageMotion } from "../../hooks/usePageMove";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { useLoading } from "../../hooks/useLoading";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";

const MAX_MEMORIES = 50;
const MAX_MEMORY_LENGTH = 280;

/**
 * Memories sub-page (`/settings/ai/memories`). Lets users view, add, and
 * remove durable preferences or project facts that Little AI remembers.
 */
const Page = () => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const pageMotion = usePageMotion();
	const userSettings = useCurrentUserSettings();
	const loading = useLoading([userSettings]);
	const [draft, setDraft] = useState("");

	const ai = userSettings?.ai;
	const memories = ai?.memories ?? [];

	const saveMemories = (next: Array<LAIMemory>, failureMessage: string) => {
		if (!ai) return;
		void attempt(
			() =>
				send("settings.update", {
					ai: { ...ai, memories: next },
				}),
			failureMessage,
		);
	};

	const handleAdd = () => {
		const text = draft.trim().slice(0, MAX_MEMORY_LENGTH);
		if (text === "" || memories.length >= MAX_MEMORIES) return;
		const entry: LAIMemory = {
			id: crypto.randomUUID(),
			text,
			createdAt: Date.now(),
		};
		setDraft("");
		saveMemories([...memories, entry], "Couldn't save that memory.");
	};

	const handleDelete = (id: string) => {
		saveMemories(
			memories.filter((item) => item.id !== id),
			"Couldn't remove that memory.",
		);
	};

	return (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo="/settings/ai" />
			{loading || !ai ? (
				<LUILoading />
			) : (
				<LUISettingsLayout pageName="Memories">
					<div className="flex w-full flex-col gap-y-3 pt-1 pb-4">
						<div className="flex items-center gap-x-1.5">
							<input
								type="text"
								value={draft}
								maxLength={MAX_MEMORY_LENGTH}
								aria-label="Add a memory"
								placeholder="Add a preference or fact to remember"
								onChange={(event) =>
									setDraft(event.target.value)
								}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										handleAdd();
									}
								}}
								className={`ll-field h-9 min-w-0 grow rounded-xl border px-3 text-xs transition-colors ${
									isDark
										? "border-neutral-800 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500"
										: "border-neutral-200 bg-neutral-100 text-neutral-900 placeholder:text-neutral-500"
								}`}
							/>
							<button
								type="button"
								aria-label="Save memory"
								disabled={
									draft.trim() === "" ||
									memories.length >= MAX_MEMORIES
								}
								onClick={handleAdd}
								className={`flex h-9 shrink-0 cursor-pointer items-center gap-x-1 rounded-xl border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
									isDark
										? "border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
										: "border-neutral-200 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
								}`}
							>
								<LUIThemedIcon
									Icon={PlusIcon}
									color="currentColor"
									weight="bold"
									className="size-3.5"
								/>
								<span>Add</span>
							</button>
						</div>

						<div className="flex items-center justify-between text-xs">
							<span
								className={
									isDark
										? "text-neutral-400"
										: "text-neutral-500"
								}
							>
								{memories.length} of {MAX_MEMORIES} saved
							</span>
						</div>

						{memories.length === 0 ? (
							<div
								className={`rounded-xl border px-3.5 py-3 text-xs ${
									isDark
										? "border-neutral-800 bg-neutral-900 text-neutral-400"
										: "border-neutral-200 bg-neutral-100 text-neutral-600"
								}`}
							>
								No saved memories yet. Add one above, or ask
								Little AI to remember something in chat.
							</div>
						) : (
							<div className="flex flex-col gap-1.5">
								{memories.map((memory) => (
									<div
										key={memory.id}
										className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2 ${
											isDark
												? "border-neutral-800 bg-neutral-900"
												: "border-neutral-200 bg-neutral-100"
										}`}
									>
										<span
											className={`text-xs leading-relaxed select-text ${
												isDark
													? "text-neutral-200"
													: "text-neutral-800"
											}`}
										>
											{memory.text}
										</span>
										<button
											type="button"
											aria-label={`Forget memory: ${memory.text}`}
											onClick={() =>
												handleDelete(memory.id)
											}
											className={`flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
												isDark
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
								))}
							</div>
						)}

						<LUINote className="w-full">
							Memories are encrypted in your profile and shared
							with your configured AI provider as context when you
							chat.
						</LUINote>
					</div>
				</LUISettingsLayout>
			)}
		</motion.div>
	);
};

export { Page as LUIAIMemoriesSettings };
