import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MOTION } from "../../../route-transitions";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import { getDomainFromUrl } from "little-shared/utils/misc";
import type { Save } from "../../../storage/repositories";

import { pressable } from "../../a11y";

const Component = ({
	className,
	saves,
	linkedSaveIds,
	handleSaveLinking,
}: {
	className?: string;
	saves: Array<Save>;
	linkedSaveIds: Array<string>;
	handleSaveLinking: (saveId: string, flag: boolean) => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const [showSaves, setShowSaves] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const linkedSaves = saves.filter((save) => linkedSaveIds.includes(save.id));
	const handleOnChange = (saveId: string, flag: boolean) => {
		handleSaveLinking(saveId, flag);
		setShowSaves(false);
	};
	return (
		<div
			className={twMerge(
				`my-1 flex h-max w-full flex-col gap-y-1.5`,
				className,
			)}
		>
			<div
				className={`flex h-max w-full items-center justify-between gap-x-2`}
			>
				<span
					className={`text-xs font-medium ${
						isDark ? "text-neutral-400" : "text-neutral-600"
					}`}
				>
					Saves
				</span>
				<button
					type="button"
					className={`flex cursor-pointer items-center gap-x-1 rounded-lg border px-2 py-0.5 text-xs font-medium transition-colors ${
						isDark
							? "border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
							: "border-neutral-200 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
					}`}
					onClick={() => setShowSaves(!showSaves)}
					aria-label={
						showSaves ? "Close the save picker" : "Link a save"
					}
					aria-expanded={showSaves}
				>
					<LUIThemedIcon
						Icon={showSaves ? XIcon : PlusIcon}
						color="currentColor"
						weight="regular"
						className="size-3.5"
					/>
					<span>{showSaves ? "Close" : "Link"}</span>
				</button>
			</div>
			<AnimatePresence initial={false}>
				{showSaves ? (
					<motion.div
						className={`flex max-h-56 w-full flex-col gap-y-1.5 overflow-y-hidden rounded-xl border p-2 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-50"
						}`}
						initial={{ opacity: 0, y: -4 }}
						animate={{
							opacity: 1,
							y: 0,
							transition: MOTION.popover,
						}}
						exit={{
							opacity: 0,
							y: -4,
							transition: MOTION.popoverExit,
						}}
					>
						<input
							type="text"
							className={`h-8 w-full rounded-lg border px-2.5 text-xs transition-colors ${
								isDark
									? "border-neutral-700 bg-neutral-900 text-neutral-100 focus:border-neutral-400"
									: "border-neutral-300 bg-white text-neutral-900 focus:border-neutral-600"
							}`}
							placeholder="Search saves"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
						<div
							className={`flex w-full grow flex-col gap-y-1 overflow-y-auto ${theme}-scrollbar`}
						>
							{saves
								.filter(
									(save) => !linkedSaveIds.includes(save.id),
								)
								.filter(
									(save) =>
										save.customName
											.toLowerCase()
											.includes(
												searchQuery.toLowerCase(),
											) ||
										save.url
											.toLowerCase()
											.includes(
												searchQuery.toLowerCase(),
											),
								)
								.map((save) => (
									<div
										className={`flex h-max w-full cursor-pointer items-center gap-x-2 rounded-lg px-2 py-1.5 transition-colors ${
											isDark
												? "bg-neutral-900 hover:bg-neutral-800"
												: "bg-white hover:bg-neutral-100"
										}`}
										key={save.id}
										{...pressable(() =>
											handleOnChange(save.id, true),
										)}
									>
										<LUIThemedIcon
											Icon={PlusIcon}
											color="currentColor"
											weight="regular"
											className={`size-3.5 shrink-0 ${
												isDark
													? "text-neutral-400"
													: "text-neutral-500"
											}`}
										/>

										<div
											className={`line-clamp-1 h-max grow text-xs font-medium ${
												isDark
													? "text-neutral-100"
													: "text-neutral-900"
											}`}
										>
											{save.customName}
										</div>
										<div
											className={`flex h-full w-max shrink-0 items-center text-[11px] text-neutral-500`}
										>
											{getDomainFromUrl(save.url)}
										</div>
									</div>
								))}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
			<div
				className={`flex max-h-56 w-full flex-col gap-y-1 overflow-y-auto ${theme}-scrollbar`}
			>
				{linkedSaves.map((save) => (
					<div
						className={`flex h-max w-full items-center gap-x-2 rounded-lg px-2 py-1 ${
							isDark ? "bg-neutral-900/70" : "bg-neutral-100/80"
						}`}
						key={save.id}
					>
						<div
							className={`line-clamp-1 h-max grow text-xs font-medium ${
								isDark ? "text-neutral-200" : "text-neutral-800"
							}`}
						>
							{save.customName}
						</div>
						<div
							className={`flex h-full w-max shrink-0 items-center text-[11px] text-neutral-500`}
						>
							{getDomainFromUrl(save.url)}
						</div>
						<button
							type="button"
							className={`flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
								isDark
									? "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
									: "text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
							}`}
							onClick={() => handleOnChange(save.id, false)}
							aria-label={`Unlink save: ${save.customName}`}
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
		</div>
	);
};

export { Component as LUIVBMLinks };
