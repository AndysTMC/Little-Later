import { NotePencilIcon, UserIcon, XCircleIcon } from "@phosphor-icons/react";
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
	const avatarUrl = useObjectUrl(avatar);
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
					className={`relative h-28 w-28 rounded-full border-2 ${theme === LTHEME.DARK ? "border-neutral-700" : "border-neutral-300"}`}
				>
					{avatarUrl ? (
						<img
							src={avatarUrl}
							alt="Profile photo"
							className={`h-full w-full rounded-full object-cover`}
						/>
					) : (
						<div
							className={`h-full w-full ${theme === LTHEME.DARK ? "bg-neutral-800" : "bg-neutral-200"} rounded-full p-2`}
						>
							<LUIThemedIcon
								Icon={UserIcon}
								weight="light"
								color={
									theme === LTHEME.DARK ? "white" : "black"
								}
								className="size-full"
							/>
						</div>
					)}
					<div
						className={`absolute right-0 bottom-0 flex items-center justify-center ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} rounded-full p-0.5`}
					>
						<LUIThemedIcon
							Icon={NotePencilIcon}
							weight="fill"
							color={theme === LTHEME.DARK ? "white" : "black"}
							className="h-6 w-6"
						/>
					</div>
				</div>
			</button>
			{avatar ? (
				<button
					type="button"
					aria-label="Remove profile photo"
					className={`absolute top-0 right-0 m-0 flex h-max w-max cursor-pointer items-center justify-center rounded-full p-0`}
					onClick={onRemove}
				>
					<LUIThemedIcon
						Icon={XCircleIcon}
						weight="fill"
						color={theme === LTHEME.DARK ? "white" : "black"}
						className="h-6 w-6"
					/>
				</button>
			) : null}
		</div>
	);
};

export { Component as LUIAvatarInput };
