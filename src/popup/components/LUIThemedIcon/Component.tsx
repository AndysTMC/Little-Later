import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import {
	IconComponentType,
	LIconComponentType,
	LIconProps,
} from "../../../types";
import { IconProps } from "@phosphor-icons/react";

const Component = ({
	Icon,
	invertTheme = false,
	passedTheme,
	...iconProps
}: {
	Icon: IconComponentType | LIconComponentType;
	invertTheme?: boolean;
	passedTheme?: LTHEME;
} & IconProps &
	Partial<LIconProps>) => {
	const { theme: profileTheme } = useTheme();
	const theme = passedTheme ?? profileTheme;
	const color =
		iconProps.color ??
		(theme === (invertTheme ? LTHEME.LIGHT : LTHEME.DARK)
			? "white"
			: "black");
	// Plain white and black are the palette's, which the accent redefines
	// (src/appearance.ts). An SVG fill attribute cannot read a CSS
	// variable, so the icon fills with its CSS colour instead.
	const fromPalette = color === "white" || color === "black";
	return (
		<Icon
			{...iconProps}
			color={fromPalette ? "currentColor" : color}
			style={
				fromPalette
					? { color: `var(--color-${color})`, ...iconProps.style }
					: iconProps.style
			}
		/>
	);
};

export { Component as LUIThemedIcon };
