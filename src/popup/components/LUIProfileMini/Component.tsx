import { useRef, useState } from "react";
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
	const openingRef = useRef(false);

	const userAvatar = useUserAvatar(userProfile.id);
	const avatarUrl = useObjectUrl(userAvatar);

	const handleClick = async () => {
		if (openingRef.current) return;
		openingRef.current = true;
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
			openingRef.current = false;
			setIsAuthenticating(false);
		}
	};
	return (
		<div
			className={twMerge(
				`col-span-1 flex h-max w-full flex-col items-center justify-center gap-y-2`,
				className,
			)}
		>
			<button
				type="button"
				disabled={isAuthenticating}
				aria-label={`Open profile ${name}`}
				className={`flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 transition-all duration-150 ${
					isAuthenticating
						? "animate-pulse"
						: "hover:border-neutral-400 hover:shadow-md hover:ring-4 hover:ring-neutral-900/10 active:scale-[0.97]"
				}`}
				onClick={handleClick}
			>
				{avatarUrl ? (
					<img
						src={avatarUrl}
						alt=""
						className="h-full w-full rounded-full object-cover"
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
			<div className="line-clamp-2 h-max w-full text-center text-sm font-medium break-words text-neutral-900">
				{name}
			</div>
		</div>
	);
};

export { Component as LUIProfileMini };
