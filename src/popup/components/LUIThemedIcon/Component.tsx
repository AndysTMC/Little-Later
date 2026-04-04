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
	return (
		<Icon
			color={
				iconProps.color ??
				(theme === (invertTheme ? LTHEME.LIGHT : LTHEME.DARK)
					? "white"
					: "black")
			}
			{...iconProps}
		/>
	);
};

export { Component as LUIThemedIcon };
