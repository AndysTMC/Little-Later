import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
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

	const [isOpen, setIsOpen] = useState(true);

	const arrowSizeMap = {
		xl: "size-5",
		lg: "size-4",
		sm: "size-3",
	};

	return (
		<div
			className={twMerge(
				`flex h-max w-full flex-col overflow-clip`,
				className,
			)}
		>
			<div className={`z-10 flex h-10 w-full items-center justify-start`}>
				<div
					className={`flex h-max w-full items-center justify-start gap-x-1`}
				>
					<div
						className={`flex h-max w-max cursor-pointer items-center gap-x-1`}
						onClick={() => setIsOpen(!isOpen)}
					>
						<div
							className={`w-max text-${headerTextSize} font-bold ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
						>
							{title}
						</div>
						<LUIThemedIcon
							Icon={isOpen ? CaretUpIcon : CaretDownIcon}
							color={theme === LTHEME.DARK ? "white" : "black"}
							weight="bold"
							className={arrowSizeMap[headerTextSize]}
						/>
					</div>

					{pagination && pagination.batchCount > 1 && isOpen ? (
						<LUIPagination
							currentBatch={pagination.currentBatch}
							batchCount={pagination.batchCount}
							onBatchChange={pagination.onBatchChange}
						/>
					) : null}
				</div>
			</div>

			<div className={`z-0 w-full grow overflow-clip`}>
				<AnimatePresence>
					{isOpen ? (
						<motion.div
							className={`h-full w-full`}
							initial={{
								opacity: 0,
								translateY: "-100%",
							}}
							animate={{
								opacity: 1,
								translateY: "0%",
							}}
							transition={{
								type: "tween",
							}}
							exit={{
								opacity: 0,
								translateY: "-100%",
							}}
						>
							{children}
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
			<hr
				className={`h-0 w-full ${theme === LTHEME.DARK ? "border-neutral-700" : "border-neutral-300"}`}
			></hr>
		</div>
	);
};

export { Component as LUIGroup };
