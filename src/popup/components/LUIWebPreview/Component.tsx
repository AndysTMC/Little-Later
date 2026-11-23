import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { ArrowSquareOutIcon, ImageIcon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useObjectUrl } from "../../hooks/useObjectUrl";
import { inToolbarPopup } from "../../ceremonyWindow";

const Component = ({
	className,
	previewBlob,
	saveId,
	url,
	scaleType = "full",
}: {
	className?: string;
	previewBlob?: Blob;
	saveId?: string;
	url: string;
	scaleType?: "short" | "medium" | "full";
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const previewUrl = useObjectUrl(previewBlob);
	// Without a preview, a plain frame in the palette's colours, so the
	// accent tints it like the rest of the popup (src/appearance.ts).
	const picture = previewUrl ? (
		<img
			src={previewUrl}
			alt=""
			className="z-0 h-full w-full object-cover"
			onContextMenu={(e) => {
				e.preventDefault();
			}}
		/>
	) : (
		<div
			className={`z-0 flex h-full w-full items-center justify-center ${isDark ? "bg-neutral-900 text-neutral-600" : "bg-neutral-200 text-neutral-400"}`}
		>
			<LUIThemedIcon
				Icon={ImageIcon}
				color="currentColor"
				weight="regular"
				className="size-8"
			/>
		</div>
	);
	const handleOpenSave = () => {
		window.open(url, "_blank", "noopener,noreferrer");
	};
	const handleOpenImage = () => {
		if (!previewUrl) return;
		if (
			inToolbarPopup() &&
			saveId &&
			typeof chrome !== "undefined" &&
			chrome.runtime?.getURL
		) {
			window.open(
				`${chrome.runtime.getURL("index.html")}?surface=tab#/preview/${encodeURIComponent(saveId)}`,
				"_blank",
				"noopener,noreferrer",
			);
			return;
		}
		window.open(previewUrl, "_blank", "noopener,noreferrer");
	};

	const frameBorder = isDark ? "border-neutral-800" : "border-neutral-200";

	if (scaleType === "short" || scaleType === "medium") {
		const sizeClass =
			scaleType === "short"
				? "h-12 min-[380px]:h-16 min-[460px]:h-20"
				: "h-14 min-[380px]:h-20 min-[460px]:h-24";
		return (
			<div
				className={twMerge(
					`group relative aspect-[16/9] ${sizeClass} shrink-0 overflow-hidden rounded-xl border ${frameBorder}`,
					className,
				)}
			>
				{picture}
				<button
					type="button"
					aria-label="Open page"
					className="absolute inset-0 z-10 flex cursor-pointer flex-col items-center justify-center gap-y-0.5 bg-black/60 text-white opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
					onClick={(event) => {
						event.stopPropagation();
						handleOpenSave();
					}}
				>
					<LUIThemedIcon
						Icon={ArrowSquareOutIcon}
						color="currentColor"
						weight="regular"
						className="size-5"
					/>
					<span className="text-xs font-medium">Open</span>
				</button>
			</div>
		);
	}

	if (!previewUrl) {
		return (
			<div
				className={twMerge(
					`flex h-max w-full items-center justify-between gap-x-3 rounded-xl border px-3 py-2 ${frameBorder} ${
						isDark
							? "bg-neutral-900/60 text-neutral-400"
							: "bg-neutral-200/60 text-neutral-500"
					}`,
					className,
				)}
			>
				<div className="flex min-w-0 items-center gap-x-2 text-xs">
					<LUIThemedIcon
						Icon={ImageIcon}
						color="currentColor"
						weight="regular"
						className="size-4 shrink-0"
					/>
					<span className="truncate">No page preview captured</span>
				</div>
				<button
					type="button"
					aria-label="Open page"
					className="flex shrink-0 cursor-pointer items-center gap-x-1.5 rounded-lg bg-black/75 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black active:scale-95"
					onClick={handleOpenSave}
				>
					<LUIThemedIcon
						Icon={ArrowSquareOutIcon}
						color="currentColor"
						weight="regular"
						className="size-3.5"
					/>
					<span>Open page</span>
				</button>
			</div>
		);
	}

	return (
		<div
			className={twMerge(
				`flex h-max w-full items-center justify-center py-1`,
				className,
			)}
		>
			<div
				className={`group relative flex aspect-[16/9] w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border ${frameBorder}`}
			>
				{picture}
				<div className="absolute right-2 bottom-2 z-10 flex items-center gap-x-1.5">
					<button
						type="button"
						aria-label="Open page"
						className="flex cursor-pointer items-center gap-x-1.5 rounded-lg bg-black/75 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black active:scale-95"
						onClick={handleOpenSave}
					>
						<LUIThemedIcon
							Icon={ArrowSquareOutIcon}
							color="currentColor"
							weight="regular"
							className="size-3.5"
						/>
						<span>Open page</span>
					</button>
					{previewBlob ? (
						<button
							type="button"
							aria-label="Open preview image"
							className="flex cursor-pointer items-center gap-x-1.5 rounded-lg bg-black/75 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-colors hover:bg-black active:scale-95"
							onClick={handleOpenImage}
						>
							<LUIThemedIcon
								Icon={ImageIcon}
								color="currentColor"
								weight="regular"
								className="size-3.5"
							/>
							<span>View image</span>
						</button>
					) : null}
				</div>
			</div>
		</div>
	);
};

export { Component as LUIWebPreview };
