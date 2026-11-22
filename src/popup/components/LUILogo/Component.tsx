import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

// The Little Later mark, drawn in the palette's ink so the accent tints it
// like everything else (src/appearance.ts): the image is only its shape.
const Component = ({ className }: { className?: string }) => {
	const { theme } = useTheme();
	return (
		<span
			role="img"
			aria-label="Little Later Logo"
			className={twMerge(
				`block aspect-square ${theme === LTHEME.DARK ? "bg-white" : "bg-black"}`,
				className,
			)}
			style={{
				maskImage: "url(/images/little-light-icon.png)",
				maskSize: "contain",
				maskRepeat: "no-repeat",
				maskPosition: "center",
			}}
		/>
	);
};

export { Component as LUILogo };
