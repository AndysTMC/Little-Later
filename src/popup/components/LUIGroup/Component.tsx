import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LUIPagination } from "../LUIPagination/Component";

const Component = ({
	className,
	title,
	children,
	headerTextSize = "xl",
	pagination,
}: {
	className?: string;
	title: string;
	children: React.ReactNode;
	headerTextSize?: "xl" | "lg" | "sm";
	pagination?: {
		currentBatch: number;
		batchCount: number;
		onBatchChange: (batch: number) => void;
	};
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const [isOpen, setIsOpen] = useState(true);

	const textSizeMap = {
		xl: "text-base font-semibold",
		lg: "text-sm font-semibold",
		sm: "text-xs font-semibold uppercase tracking-wide",
	};

	const arrowSizeMap = {
		xl: "size-4",
		lg: "size-3.5",
		sm: "size-3",
	};

	return (
		<div
			className={twMerge(
				`flex h-max w-full flex-col gap-y-1.5 py-1`,
				className,
			)}
		>
			<div className="flex h-8 w-full items-center justify-between gap-x-2">
				<button
					type="button"
					aria-expanded={isOpen}
					className={`flex h-max w-max cursor-pointer items-center gap-x-1.5 rounded-lg bg-transparent py-0.5 transition-colors ${
						isDark
							? "text-neutral-200 hover:text-white"
							: "text-neutral-800 hover:text-black"
					}`}
					onClick={() => setIsOpen(!isOpen)}
				>
					<span className={textSizeMap[headerTextSize]}>{title}</span>
					<LUIThemedIcon
						Icon={CaretDownIcon}
						color="currentColor"
						weight="regular"
						className={`${arrowSizeMap[headerTextSize]} transition-transform duration-150 ${isOpen ? "rotate-0" : "-rotate-90"}`}
					/>
				</button>

				{pagination && pagination.batchCount > 1 && isOpen ? (
					<LUIPagination
						currentBatch={pagination.currentBatch}
						batchCount={pagination.batchCount}
						onBatchChange={pagination.onBatchChange}
					/>
				) : null}
			</div>

			<AnimatePresence initial={false}>
				{isOpen ? (
					<motion.div
						className="w-full overflow-hidden"
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.16, ease: "easeOut" }}
					>
						<div className="flex w-full flex-col gap-y-2">
							{children}
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
};

export { Component as LUIGroup };
