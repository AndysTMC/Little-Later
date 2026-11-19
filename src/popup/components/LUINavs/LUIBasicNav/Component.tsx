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
				`flex h-16 w-full shrink-0 items-center p-2`,
				className,
			)}
		>
			<div className={`h-full w-max`}>
				<LUILogo className="h-full" />
			</div>
			{goBackDisabled ? null : (
				<div className={`flex h-full grow items-center justify-end`}>
					<button
						type="button"
						aria-label="Go back"
						className={`flex h-full cursor-pointer items-center justify-center px-3`}
						onClick={handleGoBack}
					>
						<span
							className={`flex h-full items-center justify-center gap-x-1 transition-transform duration-100 ease-in-out hover:-translate-x-1 active:translate-x-0`}
						>
							<LUIThemedIcon
								Icon={ArrowLeftIcon}
								weight="regular"
								className="size-6"
								passedTheme={theme}
							/>
							<span
								className={`text-lg ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
							>
								Go Back
							</span>
						</span>
					</button>
				</div>
			)}
		</div>
	);
};

export { Component as LUIBasicNav };
