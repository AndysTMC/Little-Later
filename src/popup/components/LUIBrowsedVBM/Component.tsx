import { useRef, useState } from "react";
import { twMerge } from "tailwind-merge";
import { LTHEME } from "little-shared/enums";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { LUIDeleteButton } from "../LUIDeleteButton/Component";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { LReminderIcon, LVBMIcon, LTaskIcon } from "../LUIIcons";
import { useTheme } from "../../hooks/useTheme";
import type { Save } from "../../../storage/repositories";
import { LUIWebPreview } from "../LUIWebPreview/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LUITooltip } from "../LUITooltip/Component";
import { useLazySavePreview } from "../../hooks/useSavePreview";
import { lastSeenInfo, prettyDate } from "../../../utils/dates";
import { send } from "../../../utils/send";

import { attempt } from "../../attempt";

const Component = ({
	className,
	visualBM,
}: {
	className?: string;
	visualBM: Save;
}) => {
	const go = useMoveNavigate();
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const [isCreatingSave, setIsCreatingSave] = useState(false);
	const savingRef = useRef(false);

	const handleSaveClick = async (): Promise<boolean> => {
		if (visualBM.saved) return true;
		if (savingRef.current) return false;
		savingRef.current = true;
		setIsCreatingSave(true);
		try {
			return await attempt(
				() => send("save.update", { id: visualBM.id, saved: true }),
				"Couldn't save this page.",
			);
		} finally {
			savingRef.current = false;
			setIsCreatingSave(false);
		}
	};

	const handleTaskClick = async (webDataUrl: string) => {
		if (!(await handleSaveClick())) return;
		go("/home/new-task", "forward", {
			state: { passedWebDataUrl: webDataUrl, passedSaveId: visualBM.id },
		});
	};

	const handleReminderClick = async (webDataUrl: string) => {
		if (!(await handleSaveClick())) return;
		go("/home/new-reminder", "forward", {
			state: { passedWebDataUrl: webDataUrl, passedSaveId: visualBM.id },
		});
	};

	const { preview, elementRef } = useLazySavePreview(visualBM.id);

	const actionBtn = `flex size-8 cursor-pointer items-center justify-center rounded-lg border transition-all duration-150 active:scale-95 ${
		isDark
			? "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white"
			: "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-200 hover:text-black"
	}`;

	return (
		<div
			ref={elementRef}
			className={twMerge(
				`my-1 flex h-max w-full items-start gap-x-3 rounded-2xl border p-2.5 transition-colors ${
					isDark
						? "border-neutral-800 bg-neutral-900/70 hover:border-neutral-700"
						: "border-neutral-200 bg-neutral-100/70 hover:border-neutral-300"
				}`,
				className,
			)}
		>
			<LUIWebPreview
				scaleType="medium"
				previewBlob={preview}
				saveId={visualBM.id}
				url={visualBM.url}
			/>
			<div className="flex min-w-0 grow flex-col gap-y-1">
				<div
					className={`line-clamp-2 text-sm leading-snug font-semibold text-pretty break-words ${
						isDark ? "text-neutral-100" : "text-neutral-900"
					}`}
				>
					{visualBM.customName || visualBM.title || visualBM.url}
				</div>
				{visualBM.url ? (
					<div
						title={visualBM.url}
						className={`truncate text-xs ${
							isDark ? "text-neutral-400" : "text-neutral-500"
						}`}
					>
						{visualBM.url.replace(/^https?:\/\//i, "")}
					</div>
				) : null}
				<div
					className={`truncate text-xs ${
						isDark ? "text-neutral-500" : "text-neutral-500"
					}`}
				>
					<span className="font-medium">
						{lastSeenInfo(visualBM.browsedAt)}
					</span>
					{" · "}
					{prettyDate(visualBM.browsedAt)}
				</div>
				<div className="flex w-full flex-wrap items-center gap-1.5 pt-0.5">
					<LUITooltip
						content={visualBM.saved ? "Saved" : "Save this page"}
						placement="top"
					>
						<button
							type="button"
							aria-label={
								visualBM.saved ? "Saved" : "Save this page"
							}
							className={
								visualBM.saved
									? "ll-accent-fill flex size-8 cursor-default items-center justify-center rounded-lg"
									: actionBtn
							}
							onClick={
								!visualBM.saved ? handleSaveClick : undefined
							}
						>
							{!isCreatingSave ? (
								<LUIThemedIcon
									Icon={LVBMIcon}
									color="currentColor"
									weight={visualBM.saved ? "fill" : "regular"}
									className="size-4"
								/>
							) : (
								<LUIThemedIcon
									Icon={CircleNotchIcon}
									color="currentColor"
									weight="bold"
									className="size-4 animate-spin"
								/>
							)}
						</button>
					</LUITooltip>
					<LUITooltip
						content="New task for this page"
						placement="top"
					>
						<button
							type="button"
							aria-label="New task for this page"
							className={actionBtn}
							onClick={() => handleTaskClick(visualBM.url)}
						>
							<LUIThemedIcon
								Icon={LTaskIcon}
								color="currentColor"
								weight="regular"
								className="size-4"
							/>
						</button>
					</LUITooltip>
					<LUITooltip
						content="New reminder for this page"
						placement="top"
					>
						<button
							type="button"
							aria-label="New reminder for this page"
							className={actionBtn}
							onClick={() => handleReminderClick(visualBM.url)}
						>
							<LUIThemedIcon
								Icon={LReminderIcon}
								color="currentColor"
								weight="regular"
								className="size-4"
							/>
						</button>
					</LUITooltip>
					<div className="flex grow justify-end">
						<LUIDeleteButton
							subject="from history"
							onDelete={() =>
								send("save.update", {
									id: visualBM.id,
									browsed: false,
								})
							}
							failureMessage="Couldn't remove this page from history."
						/>
					</div>
				</div>
			</div>
		</div>
	);
};

export { Component as LUIBrowsedVBM };
