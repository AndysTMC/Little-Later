import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

const PaginationBlock = ({
	children,
	className,
	theme,
	isActive = false,
	isDisabled = false,
	onClick = () => {},
	label,
}: {
	children?: React.ReactNode;
	className?: string;
	theme: LTHEME;
	isActive?: boolean;
	isDisabled?: boolean;
	onClick?: () => void;
	label?: string;
}) => {
	const isDark = theme === LTHEME.DARK;
	return (
		<button
			type="button"
			aria-label={label}
			aria-current={isActive ? "page" : undefined}
			className={twMerge(
				`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
					isActive
						? "ll-accent-fill"
						: `not-disabled:cursor-pointer ${
								isDark
									? "bg-neutral-900 text-neutral-300 not-disabled:hover:bg-neutral-800"
									: "bg-neutral-100 text-neutral-700 not-disabled:hover:bg-neutral-200"
							}`
				}`,
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
	const isDark = theme === LTHEME.DARK;
	if (batchCount <= 1) return null;

	const pages: Array<number | "ellipsis-start" | "ellipsis-end"> = [];
	if (currentBatch > 2) pages.push(1);
	if (currentBatch > 3) pages.push("ellipsis-start");
	if (currentBatch > 1) pages.push(currentBatch - 1);
	pages.push(currentBatch);
	if (currentBatch < batchCount) pages.push(currentBatch + 1);
	if (currentBatch + 2 === batchCount) pages.push(currentBatch + 2);
	if (currentBatch < batchCount - 2) {
		pages.push("ellipsis-end");
		pages.push(batchCount);
	}

	return (
		<div
			className={twMerge(
				`flex h-max w-max items-center gap-x-1`,
				className,
			)}
		>
			<PaginationBlock
				label="Previous page"
				theme={theme}
				isDisabled={currentBatch <= 1}
				onClick={() => onBatchChange(currentBatch - 1)}
			>
				<LUIThemedIcon
					Icon={CaretLeftIcon}
					color="currentColor"
					weight="regular"
					className="size-3.5"
				/>
			</PaginationBlock>
			{pages.map((entry) =>
				typeof entry === "string" ? (
					<span
						key={entry}
						aria-hidden
						className={`px-1 text-xs ${isDark ? "text-neutral-500" : "text-neutral-400"}`}
					>
						…
					</span>
				) : (
					<PaginationBlock
						key={entry}
						theme={theme}
						isActive={entry === currentBatch}
						onClick={() => onBatchChange(entry)}
					>
						{entry}
					</PaginationBlock>
				),
			)}
			<PaginationBlock
				label="Next page"
				theme={theme}
				isDisabled={currentBatch >= batchCount}
				onClick={() => onBatchChange(currentBatch + 1)}
			>
				<LUIThemedIcon
					Icon={CaretRightIcon}
					color="currentColor"
					weight="regular"
					className="size-3.5"
				/>
			</PaginationBlock>
		</div>
	);
};

export { Component as LUIPagination };
