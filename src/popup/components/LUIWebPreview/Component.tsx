import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { GoogleChromeLogoIcon, ImageIcon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useObjectUrl } from "../../hooks/useObjectUrl";

const Component = ({
	className,
	previewBlob,
	url,
	scaleType = "full",
}: {
	className?: string;
	previewBlob?: Blob;
	url: string;
	scaleType?: "short" | "medium" | "full";
}) => {
	const { theme } = useTheme();
	const previewUrl = useObjectUrl(previewBlob);
	const imageSrc = previewUrl ?? `/images/web-preview-holder-${theme}.png`;
	const handleOpenSave = () => {
		window.open(url, "_blank", "noopener,noreferrer");
	};
	const handleOpenImage = () => {
		if (!previewUrl) return;
		window.open(previewUrl, "_blank", "noopener,noreferrer");
	};
	if (scaleType === "short") {
		return (
			<div
				className={twMerge(
					`aspect-[16/9] h-22 shrink-0 overflow-hidden rounded-lg border-2 ${theme === LTHEME.DARK ? "border-neutral-700" : "border-neutral-300"} group relative`,
					className,
				)}
			>
				<img
					src={imageSrc}
					alt=""
					className={`z-0 h-full w-full object-cover`}
					onContextMenu={(e) => {
						e.preventDefault();
					}}
				/>
				<button
					type="button"
					className={`absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 ${theme === LTHEME.DARK ? "bg-white/50" : "bg-black/50"} z-10 cursor-pointer transition-all duration-100`}
					onClick={handleOpenSave}
				>
					<LUIThemedIcon
						Icon={GoogleChromeLogoIcon}
						color={theme === LTHEME.DARK ? "black" : "white"}
						weight="bold"
						className="h-max w-7 transition-all"
					/>
					<span
						className={`text-base font-semibold ${theme === LTHEME.DARK ? "text-black" : "text-white"} `}
					>
						Open
					</span>
				</button>
			</div>
		);
	} else if (scaleType === "medium") {
		return (
			<div
				className={twMerge(
					`aspect-[16/9] h-30 shrink-0 overflow-hidden rounded-lg border-2 ${theme === LTHEME.DARK ? "border-neutral-700" : "border-neutral-300"} group relative`,
					className,
				)}
			>
				<img
					src={imageSrc}
					alt=""
					className={`z-0 h-full w-full object-cover`}
					onContextMenu={(e) => {
						e.preventDefault();
					}}
				/>
				<button
					type="button"
					className={`absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 ${theme === LTHEME.DARK ? "bg-white/50" : "bg-black/50"} z-10 cursor-pointer transition-all duration-100`}
					onClick={handleOpenSave}
				>
					<LUIThemedIcon
						Icon={GoogleChromeLogoIcon}
						color={theme === LTHEME.DARK ? "black" : "white"}
						weight="bold"
						className="h-max w-7 transition-all"
					/>
					<span
						className={`text-base font-semibold ${theme === LTHEME.DARK ? "text-black" : "text-white"} `}
					>
						Open
					</span>
				</button>
			</div>
		);
	} else {
		return (
			<div
				className={twMerge(
					`flex h-max w-full items-center justify-center p-3`,
					className,
				)}
			>
				<div
					className={`flex aspect-[16/9] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 ${theme === LTHEME.DARK ? "border-neutral-700" : "border-neutral-300"} group relative`}
				>
					<img
						src={imageSrc}
						alt=""
						className={`z-0 h-full w-full object-cover`}
						onContextMenu={(e) => {
							e.preventDefault();
						}}
					/>
					<div
						className={`absolute inset-0 z-10 flex flex-col items-center justify-start p-2 transition-all duration-100`}
					>
						<div
							className={`flex h-max w-full flex-col items-end gap-y-1`}
						>
							<button
								type="button"
								className={`flex items-center gap-x-1 text-xs font-semibold ${
									theme === LTHEME.DARK
										? "bg-neutral-100 text-neutral-900"
										: "bg-neutral-900 text-neutral-100"
								} cursor-pointer rounded-full px-3 py-1 opacity-50 shadow-md shadow-neutral-500 transition-all group-hover:opacity-100 hover:duration-100 active:scale-95`}
								onClick={handleOpenSave}
							>
								<LUIThemedIcon
									Icon={GoogleChromeLogoIcon}
									color={
										theme === LTHEME.DARK
											? "black"
											: "white"
									}
									weight="bold"
									className="h-max w-6"
								/>
								<span
									className={`text-base font-semibold ${theme === LTHEME.DARK ? "text-black" : "text-white"} `}
								>
									Open
								</span>
							</button>
							{previewBlob ? (
								<button
									type="button"
									className={`flex items-center gap-x-1 text-xs font-semibold ${
										theme === LTHEME.DARK
											? "bg-neutral-100 text-neutral-900"
											: "bg-neutral-900 text-neutral-100"
									} cursor-pointer rounded-full px-3 py-1 opacity-50 shadow-md shadow-neutral-500 transition-all group-hover:opacity-100 hover:duration-100 active:scale-95`}
									onClick={handleOpenImage}
								>
									<LUIThemedIcon
										Icon={ImageIcon}
										color={
											theme === LTHEME.DARK
												? "black"
												: "white"
										}
										weight="bold"
										className="h-max w-6"
									/>
									<span
										className={`text-base font-semibold ${theme === LTHEME.DARK ? "text-black" : "text-white"} `}
									>
										Open
									</span>
								</button>
							) : null}
						</div>
					</div>
				</div>
			</div>
		);
	}
};

export { Component as LUIWebPreview };
