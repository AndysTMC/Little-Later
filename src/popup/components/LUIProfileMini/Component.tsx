import { useState } from "react";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { UserCircleIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { twMerge } from "tailwind-merge";
import { isFirstTimeUser } from "../../../services/settings";
import { createToast } from "../../../services/toasts";
import { LTOAST_TYPE } from "little-shared/enums";
import type { UserProfile } from "../../hooks/useUserProfiles";
import { send } from "../../../utils/send";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { useObjectUrl } from "../../hooks/useObjectUrl";

const Component = ({
	className,
	userProfile,
	name,
}: {
	className?: string;
	userProfile: UserProfile;
	name: string;
}) => {
	const go = useMoveNavigate();

	const [isAuthenticating, setIsAuthenticating] = useState(false);

	const userAvatar = useUserAvatar(userProfile.id);
	const avatarUrl = useObjectUrl(userAvatar);

	const handleClick = async () => {
		setIsAuthenticating(true);
		try {
			if (userProfile.hasPassword) {
				go("/unlock/" + userProfile.id, "into");
				return;
			}
			await send("profile.unlock", {
				profileId: userProfile.id,
				password: null,
			});
			// Opening a profile always zooms into it, as unlocking does.
			go(
				(await isFirstTimeUser()) ? "/getting-started" : "/home",
				"into",
			);
		} catch (error) {
			console.error("Failed to open profile.", error);
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't open this profile.",
				LTOAST_TYPE.ERROR,
			);
		} finally {
			setIsAuthenticating(false);
		}
	};
	return (
		<div
			className={twMerge(
				`col-span-1 flex h-max w-full flex-col items-center justify-center`,
				className,
			)}
		>
			<div className="h-2 w-full"></div>
			<button
				type="button"
				aria-label={`Open profile ${name}`}
				className={`flex h-max w-max cursor-pointer items-center justify-start bg-transparent p-1 transition-transform duration-300 ease-in-out ${
					isAuthenticating
						? "animate-bounce-profile"
						: "hover:-translate-y-1"
				}`}
				onClick={handleClick}
			>
				{avatarUrl ? (
					<img
						src={avatarUrl}
						alt=""
						className={`h-24 w-24 rounded-full object-cover`}
						draggable="false"
					/>
				) : (
					<LUIThemedIcon
						Icon={UserCircleIcon}
						weight="fill"
						className="size-24"
					/>
				)}
			</button>
			<div
				className={`line-clamp-2 h-max max-h-full text-center text-lg text-ellipsis`}
			>
				{name}
			</div>
		</div>
	);
};

export { Component as LUIProfileMini };
