import { ArrowCircleRightIcon } from "@phosphor-icons/react";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useContext, useState } from "react";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { HomeContext } from "../../contexts/Home";
import { twMerge } from "tailwind-merge";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";

const Component = ({
	className,
	content,
	navigateTo,
	hoverBackground = "",
	disableNavs = false,
}: {
	className?: string;
	content: string;
	navigateTo: string;
	hoverBackground: string;
	disableNavs?: boolean;
}) => {
	const { theme } = useTheme();
	const { setHomeNavigation, setHomeSubNavigation, setShouldHomeNavigate } =
		useContext(HomeContext);
	const [hovered, setHovered] = useState(false);
	const handleOnClick = () => {
		if (disableNavs) return;
		setHomeSubNavigation({
			exit: exitTransitions.none,
		});
		setHomeNavigation({
			exit: exitTransitions.slideLeft,
			navigateTo,
			navigateOptions: {
				state: { entryTransition: entryTransitions.slideLeft },
			},
		});
		setShouldHomeNavigate(true);
	};
	return (
		<div
			className={twMerge(
				`my-0.5 flex min-h-6 w-full items-start gap-x-1 rounded-xl pr-1 pl-2 ${hovered ? hoverBackground : ""} `,
				className,
			)}
		>
			<div
				className={`flex h-auto grow cursor-pointer items-center justify-center p-1`}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				onClick={handleOnClick}
			>
				<div
					className={`h-max w-full text-xs font-medium ${theme === LTHEME.DARK ? "text-white" : "text-black"} text-wrap`}
				>
					{content}
				</div>
			</div>

			{!disableNavs ? (
				<div
					className={`flex h-auto w-6 items-center justify-center ${hovered ? "translate-x-1" : ""} transition-transform duration-200`}
				>
					<LUIThemedIcon
						Icon={ArrowCircleRightIcon}
						color={theme === LTHEME.DARK ? "white" : "black"}
						weight="fill"
						className={`size-6`}
					/>
				</div>
			) : null}
		</div>
	);
};

export { Component as LUILink };
