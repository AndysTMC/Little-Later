import {
	PlusIcon,
	PlusCircleIcon,
	TrashIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import { LVisualBM } from "little-shared/types";

const Component = ({
	className,
	saves,
	linkedSaveIds,
	handleSaveLinking,
}: {
	className?: string;
	saves: Array<LVisualBM>;
	linkedSaveIds: number[];
	handleSaveLinking: (saveId: number, flag: boolean) => void;
}) => {
	const { theme } = useTheme();
	const [showSaves, setShowSaves] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const linkedSaves = saves.filter((save) => linkedSaveIds.includes(save.id));
	const handleOnChange = (saveId: number, flag: boolean) => {
		handleSaveLinking(saveId, flag);
		setShowSaves(false);
	};
	return (
		<div
			className={twMerge(
				`my-1 flex h-max w-full flex-col gap-y-1`,
				className,
			)}
		>
			<div
				className={`flex h-max w-full items-center justify-start gap-x-1`}
			>
				<div
					className={`rounded-full border font-semibold ${
						theme === LTHEME.DARK
							? "border-white text-white"
							: "border-black text-black"
					} px-5`}
				>
					Saves
				</div>
				<div
					className={`h-max w-max cursor-pointer`}
					onClick={() => setShowSaves(!showSaves)}
				>
					<LUIThemedIcon
						Icon={showSaves ? XCircleIcon : PlusCircleIcon}
						color={theme === LTHEME.DARK ? "white" : "black"}
						weight={showSaves ? "light" : "fill"}
						className={`size-6`}
					/>
				</div>
			</div>
			<AnimatePresence>
				{showSaves ? (
					<motion.div
						className={`flex max-h-56 w-full flex-col overflow-y-hidden rounded-lg border border-neutral-500 p-2`}
						initial={{ opacity: 0 }}
						animate={{
							opacity: 1,
						}}
						exit={{ opacity: 0 }}
					>
						<div className={`h-max w-full px-2 py-1`}>
							<input
								type="text"
								className={`h-max w-full border ${
									theme === LTHEME.DARK
										? "border-neutral-700 bg-black text-white focus:border-neutral-300"
										: "border-neutral-300 bg-white text-black focus:border-neutral-700"
								} rounded-lg px-2 text-base outline-none`}
								placeholder="Search"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>
						<div
							className={`w-full grow overflow-y-auto ${theme}-scrollbar px-2`}
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
										save.id
											.toString()
											.toLowerCase()
											.includes(
												searchQuery.toLowerCase(),
											),
								)
								.map((save, index) => (
									<div
										className={`flex h-max w-full items-center gap-x-1 ${
											theme === LTHEME.DARK
												? "bg-neutral-900 hover:bg-neutral-800"
												: "bg-neutral-100 hover:bg-neutral-200"
										} cursor-pointer`}
										key={index}
										onClick={() =>
											handleOnChange(save.id, true)
										}
									>
										<div className={`h-full w-max`}>
											<LUIThemedIcon
												Icon={PlusIcon}
												color={
													theme === LTHEME.DARK
														? "white"
														: "black"
												}
												weight={"light"}
												className={`size-4`}
											/>
										</div>

										<div
											className={`line-clamp-1 h-max grow text-sm ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
										>
											{save.customName}
										</div>
										<div
											className={`flex h-full w-max items-center text-xs text-neutral-500`}
										>
											#{save.id}
										</div>
									</div>
								))}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
			<div className={`flex max-h-56 w-full flex-col`}>
				{linkedSaves.map((save, index) => (
					<div
						className={`flex h-max w-full items-center gap-x-1`}
						key={index}
					>
						<div
							className={`flex h-full w-max items-center justify-center border border-neutral-500 ${
								theme === LTHEME.DARK
									? "hover:bg-neutral-900"
									: "hover:bg-neutral-100"
							} cursor-pointer rounded-lg px-2`}
							onClick={() => handleOnChange(save.id, false)}
						>
							<LUIThemedIcon
								Icon={TrashIcon}
								color={
									theme === LTHEME.DARK ? "white" : "black"
								}
								weight={"light"}
								className={`size-4`}
							/>
						</div>

						<div
							className={`line-clamp-1 h-max grow text-sm ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
						>
							{save.customName}
						</div>
						<div
							className={`flex h-full w-max shrink-0 items-center text-xs text-neutral-500`}
						>
							#{save.id}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

export { Component as LUISaveLinks };
