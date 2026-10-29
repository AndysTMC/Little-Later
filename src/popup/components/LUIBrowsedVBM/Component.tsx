import { useState } from "react";
import { useNavigate } from "react-router";
import { twMerge } from "tailwind-merge";
import { LTHEME } from "little-shared/enums";
import { CircleNotchIcon, TrashIcon } from "@phosphor-icons/react";
import { entryTransitions } from "../../../route-transitions";
import { LReminderIcon, LVBMIcon, LTaskIcon } from "../LUIIcons";
import { useTheme } from "../../hooks/useTheme";
import type { Save } from "../../../storage/repositories";
import { fakeWait } from "little-shared/utils/misc";
import { LUIWebPreview } from "../LUIWebPreview/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useLazySavePreview } from "../../hooks/useSavePreview";
import { lastSeenInfo, prettyDate } from "../../../utils/dates";
import { send } from "../../../utils/send";

const Component = ({
	className,
	visualBM,
}: {
	className?: string;
	visualBM: Save;
}) => {
	const navigate = useNavigate();
	const { theme } = useTheme();
	const [isCreatingSave, setIsCreatingSave] = useState(false);

	const handleSaveClick = async () => {
		setIsCreatingSave(true);
		await fakeWait();
		await send("save.update", { id: visualBM.id, saved: true });
		setIsCreatingSave(false);
	};

	const handleTaskClick = async (webDataUrl: string) => {
		await handleSaveClick();
		navigate("/home/new-task", {
			state: {
				passedWebDataUrl: webDataUrl,
				passedSaveId: visualBM.id,
				subEntryTransition: entryTransitions.slideUp,
			},
		});
	};

	const handleReminderClick = async (webDataUrl: string) => {
		await handleSaveClick();
		navigate("/home/new-reminder", {
			state: {
				passedWebDataUrl: webDataUrl,
				passedSaveId: visualBM.id,
				subEntryTransition: entryTransitions.slideUp,
			},
		});
	};

	const handleDeleteClick = async () => {
		await send("save.update", { id: visualBM.id, browsed: false });
	};

	const { preview, elementRef } = useLazySavePreview(visualBM.id);

	return (
		<div
			ref={elementRef}
			className={twMerge(
				`h-max w-full transition-all duration-100`,
				className,
			)}
		>
			<div className={`flex h-max w-full gap-x-2.5`}>
				<LUIWebPreview
					scaleType="medium"
					previewBlob={preview}
					url={visualBM.url}
				/>
				<div className={`flex h-auto w-full grow flex-col`}>
					<div
						className={`h-max w-full shrink-0 text-base font-semibold ${
							theme === LTHEME.DARK
								? "text-neutral-100"
								: "text-neutral-900"
						} line-clamp-3 leading-snug text-pretty break-all text-ellipsis`}
					>
						{visualBM.customName || visualBM.title || visualBM.url}
					</div>
					<div
						className={`flex w-full grow flex-col justify-end gap-y-1 pb-0.5`}
					>
						<div
							className={`h-max w-full text-xs font-medium ${theme === LTHEME.DARK ? "text-white" : "text-black"} opacity-50`}
						>
							<span className="font-bold">
								( {lastSeenInfo(visualBM.browsedAt)} ) &nbsp;
							</span>
							{prettyDate(visualBM.browsedAt)}
						</div>
						<div className={`flex h-max w-full gap-x-2 opacity-80`}>
							<button
								className={`h-max w-max border ${theme === LTHEME.DARK ? "border-white" : "border-black"} ${
									visualBM.saved
										? theme === LTHEME.DARK
											? "bg-white"
											: "bg-black"
										: theme === LTHEME.DARK
											? "hover:bg-neutral-800"
											: "hover:bg-neutral-200"
								} rounded-lg p-1 ${visualBM.saved ? "cursor-default" : "cursor-pointer"} `}
								onClick={
									!visualBM.saved
										? handleSaveClick
										: undefined
								}
							>
								{!isCreatingSave ? (
									<LUIThemedIcon
										Icon={LVBMIcon}
										color={
											theme === LTHEME.DARK
												? visualBM.saved
													? "black"
													: "white"
												: visualBM.saved
													? "white"
													: "black"
										}
										weight="fill"
										className="size-5"
									/>
								) : (
									<LUIThemedIcon
										Icon={CircleNotchIcon}
										color={
											theme === LTHEME.DARK
												? visualBM.saved
													? "black"
													: "white"
												: visualBM.saved
													? "white"
													: "black"
										}
										weight="bold"
										className="size-5 animate-spin"
									/>
								)}
							</button>
							<button
								className={`h-max w-max border ${
									theme === LTHEME.DARK
										? "border-white hover:bg-neutral-800"
										: "border-black hover:bg-neutral-200"
								} cursor-pointer rounded-lg p-1`}
								onClick={() => handleTaskClick(visualBM.url)}
							>
								<LUIThemedIcon
									Icon={LTaskIcon}
									color={
										theme === LTHEME.DARK
											? "white"
											: "black"
									}
									weight="fill"
									className="size-5"
								/>
							</button>
							<button
								className={`h-max w-max border ${
									theme === LTHEME.DARK
										? "border-white hover:bg-neutral-800"
										: "border-black hover:bg-neutral-200"
								} cursor-pointer rounded-lg p-1`}
								onClick={() =>
									handleReminderClick(visualBM.url)
								}
							>
								<LUIThemedIcon
									Icon={LReminderIcon}
									color={
										theme === LTHEME.DARK
											? "white"
											: "black"
									}
									weight="fill"
									className="size-5"
								/>
							</button>
							<button
								className={`h-max w-max border ${
									theme === LTHEME.DARK
										? "border-white hover:bg-neutral-800"
										: "border-black hover:bg-neutral-200"
								} cursor-pointer rounded-lg p-1`}
								onClick={handleDeleteClick}
							>
								<LUIThemedIcon
									Icon={TrashIcon}
									color={
										theme === LTHEME.DARK
											? "white"
											: "black"
									}
									weight="fill"
									className="size-5"
								/>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export { Component as LUIBrowsedVBM };
