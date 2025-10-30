import { forwardRef, useContext, ReactElement } from "react";
import { LIconContext } from "./context";
import { LIconProps, LIconWeight } from "../../../../types";

interface LIconBaseProps extends LIconProps {
	weights: Map<LIconWeight, ReactElement>;
}

const LIconBase = forwardRef<SVGSVGElement, LIconBaseProps>((props, ref) => {
	const {
		alt,
		color,
		size,
		weight,
		mirrored,
		children,
		weights,
		...restProps
	} = props;

	const {
		color: contextColor = "currentColor",
		size: contextSize,
		weight: contextWeight = "bold",
		mirrored: contextMirrored = false,
		...restContext
	} = useContext(LIconContext);

	return (
		<svg
			ref={ref}
			xmlns="http://www.w3.org/2000/svg"
			width={size ?? contextSize}
			height={size ?? contextSize}
			fill={color ?? contextColor}
			stroke={color ?? contextColor}
			viewBox="0 0 256 256"
			transform={mirrored || contextMirrored ? "scale(-1, 1)" : undefined}
			{...restContext}
			{...restProps}
		>
			{!!alt && <title>{alt}</title>}
			{children}
			{weights.get(weight ?? contextWeight)}
		</svg>
	);
});

LIconBase.displayName = "LittleIconBase";

export default LIconBase;
