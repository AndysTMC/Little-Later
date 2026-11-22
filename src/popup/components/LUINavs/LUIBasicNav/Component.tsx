import { LUILogo } from "../../LUILogo/Component";
import { useTheme } from "../../../hooks/useTheme";
import { useLocation } from "react-router";
import { LUIThemedIcon } from "../../LUIThemedIcon/Component";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import type { Move } from "../../../../route-transitions";
import { useMoveNavigate } from "../../../hooks/usePageMove";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	navigateTo,
	goBackDisabled = false,
	move = "back",
	goBackCallback = async () => {},
	passedTheme,
}: {
	className?: string;
	navigateTo?: string;
	goBackDisabled?: boolean;
	// How going back looks: the reverse of how this page was opened.
	move?: Move;
	goBackCallback?: () => Promise<void>;
	passedTheme?: LTHEME;
}) => {
	const { theme: profileTheme } = useTheme();
	const theme = passedTheme ?? profileTheme;
	const isDark = theme === LTHEME.DARK;
	const go = useMoveNavigate();
	const location = useLocation();
	const { referrer } = location.state || {};
	const handleGoBack = async () => {
		if (goBackDisabled) return;
		await goBackCallback();
		const to = referrer ?? navigateTo;
		if (to) go(to, move, { replace: true });
	};
	return (
		<div
			className={twMerge(
				// Fixed height: as a flex item it shrank when the page below
				// filled up, so the logo shrank and the page jumped up.
				`flex h-16 w-full shrink-0 items-center justify-between p-2`,
				className,
			)}
		>
			{goBackDisabled ? (
				<div className="h-full w-max">
					<LUILogo className="h-full" />
				</div>
			) : (
				<>
					<button
						type="button"
						aria-label="Go back"
						className={`group flex h-10 cursor-pointer items-center gap-x-1.5 rounded-xl px-2.5 transition-colors ${
							isDark
								? "text-neutral-200 hover:bg-neutral-900 hover:text-white"
								: "text-neutral-700 hover:bg-neutral-100 hover:text-black"
						}`}
						onClick={handleGoBack}
					>
						<LUIThemedIcon
							Icon={ArrowLeftIcon}
							weight="regular"
							color="currentColor"
							className="size-5 transition-transform duration-150 group-hover:-translate-x-0.5"
							passedTheme={theme}
						/>
						<span className="text-sm font-medium">Back</span>
					</button>
					<div className="h-full w-max">
						<LUILogo className="h-full" />
					</div>
				</>
			)}
		</div>
	);
};

export { Component as LUIBasicNav };
