import { NotePencilIcon, UserIcon, XCircleIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	avatar,
	setAvatar,
	avatarInputRef,
	theme,
}: {
	className?: string;
	avatar: Blob | null;
	setAvatar: (avatarUrl: Blob | null) => void;
	avatarInputRef: React.RefObject<HTMLInputElement>;
	theme: LTHEME;
}) => {
	const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		if (!event.target.files) return;
		const blob = event.target.files[0];
		if (blob === undefined) setAvatar(null);
		setAvatar(blob);
	};
	const removeAvatar = () => {
		setAvatar(null);
		if (avatarInputRef.current) {
			avatarInputRef.current.value = "";
		}
	};
	return (
		<div className={twMerge(`relative h-max w-max`, className)}>
			<input
				type="file"
				onChange={handleAvatarChange}
				ref={avatarInputRef}
				className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
				style={{ display: "none" }}
				id="little-profile-avatar-upload"
			/>
			<label htmlFor="little-profile-avatar-upload">
				<div
					className={`relative h-28 w-28 rounded-full border-2 ${theme === LTHEME.DARK ? "border-neutral-700" : "border-neutral-300"}`}
				>
					{avatar ? (
						<img
							src={URL.createObjectURL(avatar)}
							alt="Default Avatar"
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
						className={`absolute right-0 bottom-0 flex items-center justify-center ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} cursor-pointer rounded-full p-0.5`}
					>
						<LUIThemedIcon
							Icon={NotePencilIcon}
							weight="fill"
							color={theme === LTHEME.DARK ? "white" : "black"}
							className="h-6 w-6"
						/>
					</div>
				</div>
			</label>
			{avatar ? (
				<div
					className={`absolute top-0 right-0 m-0 flex h-max w-max cursor-pointer items-center justify-center rounded-full p-0`}
					onClick={removeAvatar}
				>
					<LUIThemedIcon
						Icon={XCircleIcon}
						weight="fill"
						color={theme === LTHEME.DARK ? "white" : "black"}
						className="h-6 w-6"
					/>
				</div>
			) : null}
		</div>
	);
};

export { Component as LUIAvatarInput };
