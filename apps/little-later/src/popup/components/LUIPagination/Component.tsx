import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import {
	CaretLeftIcon,
	CaretRightIcon,
	DotsThreeOutlineIcon,
} from "@phosphor-icons/react";

const PaginationBlock = ({
	children,
	className,
	theme,
	isActive = false,
	isDisabled = false,
	onClick = () => {},
}: {
	children?: React.ReactNode;
	className?: string;
	theme: LTHEME;
	isActive?: boolean;
	isDisabled?: boolean;
	onClick?: () => void;
}) => {
	return (
		<button
			className={twMerge(
				`${theme === LTHEME.DARK ? (isActive ? "bg-white text-black" : "bg-neutral-800 text-white not-disabled:hover:bg-neutral-700") : isActive ? "bg-black text-white" : "bg-neutral-200 text-black not-disabled:hover:bg-neutral-300"} ${isActive ? "" : "not-disabled:cursor-pointer"} flex h-7 items-center justify-center rounded-md px-3 text-sm disabled:opacity-50`,
				className,
			)}
			onClick={onClick}
			disabled={isDisabled}
		>
			{children}
		</button>
	);
};

const Component = ({
	className,
	currentBatch,
	batchCount,
	onBatchChange,
}: {
	className?: string;
	currentBatch: number;
	batchCount: number;
	onBatchChange: (newBatch: number) => void;
}) => {
	const { theme } = useTheme();
	if (batchCount <= 1) return null;
	return (
		<div className={twMerge(`flex h-max w-full gap-x-1`, className)}>
			<PaginationBlock
				key={-1}
				theme={theme}
				isDisabled={currentBatch == 1}
				onClick={() => onBatchChange(currentBatch - 1)}
			>
				<LUIThemedIcon
					Icon={CaretLeftIcon}
					color={theme === LTHEME.DARK ? "white" : "black"}
					weight="regular"
					className="size-4"
				/>
			</PaginationBlock>
			<div className={`flex h-max grow gap-x-1`}>
				{currentBatch > 2 ? (
					<PaginationBlock
						key={1}
						className="shrink-0"
						theme={theme}
						onClick={() => onBatchChange(1)}
					>
						{1}
					</PaginationBlock>
				) : null}
				<div className={`flex h-max grow gap-x-1`}>
					{currentBatch > 3 ? (
						<PaginationBlock
							key={-2}
							className="grow"
							theme={theme}
							isDisabled
							onClick={() => onBatchChange(1)}
						>
							<LUIThemedIcon
								Icon={DotsThreeOutlineIcon}
								color={
									theme === LTHEME.DARK ? "white" : "black"
								}
								weight="fill"
								className="size-4"
							/>
						</PaginationBlock>
					) : null}
					{currentBatch > 1 ? (
						<PaginationBlock
							key={currentBatch - 1}
							className="shrink-0"
							theme={theme}
							onClick={() => onBatchChange(currentBatch - 1)}
						>
							{currentBatch - 1}
						</PaginationBlock>
					) : null}
					<PaginationBlock
						key={currentBatch}
						className="shrink-0"
						theme={theme}
						isActive
						onClick={() => onBatchChange(currentBatch)}
					>
						{currentBatch}
					</PaginationBlock>
					{currentBatch < batchCount ? (
						<PaginationBlock
							key={currentBatch + 1}
							className="shrink-0"
							theme={theme}
							onClick={() => onBatchChange(currentBatch + 1)}
						>
							{currentBatch + 1}
						</PaginationBlock>
					) : null}
					{currentBatch + 2 === batchCount ? (
						<PaginationBlock
							key={currentBatch + 2}
							className="shrink-0"
							theme={theme}
							onClick={() => onBatchChange(currentBatch + 2)}
						>
							{currentBatch + 2}
						</PaginationBlock>
					) : null}
					{currentBatch < batchCount - 2 ? (
						<PaginationBlock
							key={-3}
							className="grow"
							theme={theme}
							isDisabled
							onClick={() => onBatchChange(1)}
						>
							<LUIThemedIcon
								Icon={DotsThreeOutlineIcon}
								color={
									theme === LTHEME.DARK ? "white" : "black"
								}
								weight="fill"
								className="size-4"
							/>
						</PaginationBlock>
					) : null}
				</div>
				{currentBatch < batchCount - 2 ? (
					<PaginationBlock
						key={batchCount}
						className="shrink-0"
						theme={theme}
						onClick={() => onBatchChange(batchCount)}
					>
						{batchCount}
					</PaginationBlock>
				) : null}
			</div>

			<PaginationBlock
				key={-4}
				theme={theme}
				isDisabled={currentBatch >= batchCount}
				onClick={() => onBatchChange(currentBatch + 1)}
			>
				<LUIThemedIcon
					Icon={CaretRightIcon}
					color={theme === LTHEME.DARK ? "white" : "black"}
					weight="regular"
					className="size-4"
				/>
			</PaginationBlock>
		</div>
	);
};

export { Component as LUIPagination };
