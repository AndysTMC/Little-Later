import { useTheme } from "../../../hooks/useTheme";
import { useLocation, useNavigate } from "react-router";
import { LUIThemedIcon } from "../../LUIThemedIcon/Component";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { entryTransitions } from "../../../../route-transitions";
import { LTHEME } from "little-shared/enums";
import { MotionProps } from "framer-motion";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	navigateTo,
	goBackDisabled = false,
	changePreviousExit = () => {},
	entryTransition = entryTransitions.slideRight,
	goBackCallback = async () => {},
	passedTheme,
}: {
	className?: string;
	navigateTo?: string;
	goBackDisabled?: boolean;
	changePreviousExit?: () => void;
	entryTransition?: MotionProps;
	goBackCallback?: () => Promise<void>;
	passedTheme?: LTHEME;
}) => {
	const { theme: profileTheme } = useTheme();
	const theme = passedTheme ?? profileTheme;
	const navigate = useNavigate();
	const location = useLocation();
	const { referrer } = location.state || {};
	const handleGoBack = async () => {
		changePreviousExit();
		if (goBackDisabled) return;
		await goBackCallback();
		if (referrer) {
			navigate(referrer, { state: { entryTransition }, replace: true });
		} else if (navigateTo) {
			navigate(navigateTo, { state: { entryTransition }, replace: true });
		}
	};
	return (
		<div
			className={twMerge(`flex h-16 w-full items-center p-2`, className)}
		>
			<div className={`h-full w-max`}>
				<img
					src={`/images/${theme}-icon.png`}
					alt="Little Later Logo"
					className={`h-full`}
					draggable="false"
				/>
			</div>
			{goBackDisabled ? null : (
				<div className={`flex h-full grow items-center justify-end`}>
					<div
						className={`flex h-full cursor-pointer items-center justify-center px-3`}
						onClick={handleGoBack}
					>
						<button
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
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

export { Component as LUIBasicNav };
