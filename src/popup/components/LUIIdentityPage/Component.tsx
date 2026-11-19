import { UserCircleIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useObjectUrl } from "../../hooks/useObjectUrl";
import { useTheme } from "../../hooks/useTheme";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";

// The layout of the screens that act on a profile's identity: unlock,
// lock, its password and its two-factor unlock (docs/design.md, Pages). A
// centred title, the profile's photo, then the fields and buttons in one
// column, which scrolls rather than squeezing when it doesn't fit.
const Component = ({
	title,
	profile,
	busy = false,
	onSubmit,
	className,
	children,
}: {
	title: string;
	profile: { id: string; name: string };
	// The photo bounces while the action runs.
	busy?: boolean;
	// Given, the column is a form: Enter in a field submits it.
	onSubmit?: (event: React.FormEvent) => void;
	className?: string;
	children: React.ReactNode;
}) => {
	const { theme } = useTheme();
	const avatarUrl = useObjectUrl(useUserAvatar(profile.id));
	const columnClass =
		"flex min-h-0 w-full grow flex-col items-center gap-y-5 overflow-y-auto px-12 pt-5 pb-4";
	const column = (
		<>
			<div
				className={`flex h-max w-full shrink-0 items-center justify-center pt-5 ${busy ? "mt-20 animate-bounce" : ""} transition-all delay-300 duration-300`}
			>
				{avatarUrl ? (
					<img
						src={avatarUrl}
						alt={`${profile.name} avatar`}
						className="h-32 w-32 rounded-full object-cover"
						draggable={false}
					/>
				) : (
					<LUIThemedIcon
						Icon={UserCircleIcon}
						weight="fill"
						className="size-32"
					/>
				)}
			</div>
			{children}
		</>
	);
	return (
		<div
			className={twMerge(
				"flex min-h-0 w-full grow flex-col items-center justify-start gap-y-5",
				className,
			)}
		>
			<h1
				className={`mt-5 flex shrink-0 items-center justify-center text-4xl font-semibold ${theme === LTHEME.DARK ? "text-white" : "text-black"}`}
			>
				{title}
			</h1>
			{onSubmit ? (
				<form className={columnClass} onSubmit={onSubmit}>
					{column}
				</form>
			) : (
				<div className={columnClass}>{column}</div>
			)}
		</div>
	);
};

export { Component as LUIIdentityPage };
