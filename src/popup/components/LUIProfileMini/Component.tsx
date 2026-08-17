import { authenticateUser, unlockUser } from "../../../services/user";
import { useState } from "react";
import { useNavigate } from "react-router";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { UserCircleIcon } from "@phosphor-icons/react";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { MotionProps } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { fakeWait } from "little-shared/utils/misc";
import { getUserSettings } from "../../../services/settings";
import { createToast } from "../../../services/toasts";
import { LTOAST_TYPE } from "little-shared/enums";
import { LUserProfile } from "little-shared/types";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { useObjectUrl } from "../../hooks/useObjectUrl";

const Component = ({
	className,
	userProfile,
	name,
	changeExit = () => {},
}: {
	className?: string;
	userProfile: LUserProfile;
	name: string;
	changeExit: (exit: MotionProps) => void;
}) => {
	const navigate = useNavigate();

	const [isAuthenticating, setIsAuthenticating] = useState(false);

	const userAvatar = useUserAvatar(userProfile.userId);
	const avatarUrl = useObjectUrl(userAvatar?.blob);

	const handleClick = async () => {
		setIsAuthenticating(true);
		await fakeWait();
		const authenticated = await authenticateUser(userProfile.userId);
		setIsAuthenticating(false);
		if (authenticated) {
			try {
				await unlockUser(userProfile.userId);
			} catch (error) {
				console.error("Failed to unlock profile.", error);
				await createToast(
					error instanceof Error
						? error.message
						: "Couldn't unlock this profile.",
					LTOAST_TYPE.ERROR,
				);
				return;
			}
			const settings = await getUserSettings();
			if (settings.guide.isFirstTimeUser) {
				changeExit(exitTransitions.slideLeft);
				navigate("/getting-started", {
					state: { entryTransition: entryTransitions.slideLeft },
				});
			} else {
				changeExit(exitTransitions.zoomIn);
				navigate("/home", {
					state: { entryTransition: entryTransitions.zoomIn },
				});
			}
		} else {
			changeExit(exitTransitions.zoomIn);
			navigate("/unlock/" + userProfile.userId, {
				state: { entryTransition: entryTransitions.zoomIn },
			});
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
