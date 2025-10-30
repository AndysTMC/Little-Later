import { motion } from "framer-motion";
import { exitTransitions } from "../../../route-transitions";
import { LTHEME } from "little-shared/enums";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { ClockCounterClockwiseIcon } from "@phosphor-icons/react";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../LUINavs/LUIBasicNav/Component";
import { LUIFeaturePageUD } from "../LUIFeaturePageUD/Component";
import { LVisualBM } from "little-shared/types";
import { useOutletContext } from "react-router";
import { twMerge } from "tailwind-merge";
import { LUIBrowsedVBM } from "../LUIBrowsedVBM/Component";
import { usePagination } from "../../hooks/usePagination";
import { useMemo, useState } from "react";
import { LUIPagination } from "../LUIPagination/Component";
import { LDateUtl } from "little-shared/utils/datetime";

const Component = () => {
	const {
		className,
		visualBMs,
	}: {
		className?: string;
		visualBMs: Array<LVisualBM>;
	} = useOutletContext();
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		transitionName: "subEntryTransition",
		defaultExit: exitTransitions.slideUpToDown,
	});

	const history = visualBMs
		.filter((visualBM) => visualBM.hasBrowsed)
		.sort((a, b) => LDateUtl.compare(b.lastBrowseDate, a.lastBrowseDate));

	const { startIndex, endIndex, batchCount, currentBatch, onBatchChange } =
		usePagination(history.length, 5);

	const paginationHistory = useMemo(
		() => history.slice(startIndex, endIndex) || [],
		[history, startIndex, endIndex],
	);

	const [isReady, setIsReady] = useState<boolean>(false);

	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-hidden`,
				className,
			)}
			{...entry}
			{...exit}
			onAnimationComplete={() => setIsReady(true)}
		>
			<LUIBasicNav goBackDisabled />
			<div
				className={`flex w-full grow flex-col gap-y-1 overflow-y-hidden`}
			>
				<LUIFeaturePageUD Icon={ClockCounterClockwiseIcon} />
				{paginationHistory.length > 0 ? (
					<div
						className={`flex w-full grow flex-col overflow-y-hidden`}
					>
						{isReady ? (
							<motion.div
								className={`flex h-full w-full flex-col gap-y-1 overflow-y-hidden`}
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.2 }}
							>
								<div className="flex h-max w-full shrink-0 px-4 py-1">
									<LUIPagination
										currentBatch={currentBatch}
										batchCount={batchCount}
										onBatchChange={onBatchChange}
									/>
								</div>
								<div
									className={`flex w-full grow flex-col gap-y-1 overflow-y-auto ${theme}-scrollbar px-4`}
								>
									{paginationHistory.map((visualBM) => (
										<LUIBrowsedVBM
											key={visualBM.id}
											visualBM={visualBM}
										/>
									))}
									<span className="h-2 w-full" />
								</div>
							</motion.div>
						) : null}
					</div>
				) : (
					<div
						className={`flex w-full grow flex-col items-center justify-center py-8 ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
					>
						<div className="text-5xl font-extrabold text-pretty opacity-10">
							Feeling empty?
						</div>
						<div className="text-5xl font-extrabold text-pretty opacity-10">
							Start Browse!
						</div>
					</div>
				)}
			</div>
		</motion.div>
	);
};

export { Component as LUIHistory };
