import { PencilSimpleIcon, UserIcon, XIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useObjectUrl } from "../../hooks/useObjectUrl";

// Shows a profile photo and asks for a new one. The photo itself is
// chosen on the shared input screen (../../filePick.ts): `onChoose` sends
// the user there.
const Component = ({
	className,
	avatar,
	onChoose,
	onRemove,
	theme,
}: {
	className?: string;
	avatar: Blob | null;
	onChoose: () => void;
	onRemove: () => void;
	theme: LTHEME;
}) => {
	const isDark = theme === LTHEME.DARK;
	const avatarUrl = useObjectUrl(avatar);
	const badgeSurface = isDark
		? "border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800"
		: "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100";
	return (
		<div className={twMerge(`relative h-max w-max`, className)}>
			<button
				type="button"
				aria-label={
					avatar ? "Change the profile photo" : "Add a profile photo"
				}
				className="cursor-pointer rounded-full"
				onClick={onChoose}
			>
				<div
					className={`relative size-28 rounded-full border-2 ${isDark ? "border-neutral-700" : "border-neutral-300"}`}
				>
					{avatarUrl ? (
						<img
							src={avatarUrl}
							alt="Profile photo"
							className="h-full w-full rounded-full object-cover"
						/>
					) : (
						<div
							className={`h-full w-full rounded-full p-2 ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}
						>
							<LUIThemedIcon
								Icon={UserIcon}
								weight="light"
								color={isDark ? "white" : "black"}
								className="size-full"
							/>
						</div>
					)}
					<div
						className={`absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full border shadow-sm transition-colors ${badgeSurface}`}
					>
						<LUIThemedIcon
							Icon={PencilSimpleIcon}
							weight="regular"
							color="currentColor"
							className="size-3.5"
						/>
					</div>
				</div>
			</button>
			{avatar ? (
				<button
					type="button"
					aria-label="Remove profile photo"
					className={`absolute top-0 right-0 flex size-7 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors ${badgeSurface}`}
					onClick={onRemove}
				>
					<LUIThemedIcon
						Icon={XIcon}
						weight="regular"
						color="currentColor"
						className="size-3.5"
					/>
				</button>
			) : null}
		</div>
	);
};

export { Component as LUIAvatarInput };
