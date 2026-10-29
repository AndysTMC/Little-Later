import { useState } from "react";
import { useNavigate } from "react-router";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { UserCircleIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { MotionProps } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { fakeWait } from "little-shared/utils/misc";
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
	changeExit = () => {},
}: {
	className?: string;
	userProfile: UserProfile;
	name: string;
	changeExit: (exit: MotionProps) => void;
}) => {
	const navigate = useNavigate();

	const [isAuthenticating, setIsAuthenticating] = useState(false);

	const userAvatar = useUserAvatar(userProfile.id);
	const avatarUrl = useObjectUrl(userAvatar);

	const handleClick = async () => {
		setIsAuthenticating(true);
		try {
			await fakeWait();
			if (userProfile.hasPassword) {
				changeExit(exitTransitions.zoomIn);
				navigate("/unlock/" + userProfile.id, {
					state: { entryTransition: entryTransitions.zoomIn },
				});
				return;
			}
			await send("profile.unlock", {
				profileId: userProfile.id,
				password: null,
			});
			if (await isFirstTimeUser()) {
				changeExit(exitTransitions.slideLeft);
				navigate("/getting-started", {
					state: { entryTransition: entryTransitions.slideLeft },
				});
				return;
			}
			changeExit(exitTransitions.zoomIn);
			navigate("/home", {
				state: { entryTransition: entryTransitions.zoomIn },
			});
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
