import { forwardRef, ReactElement } from "react";
import { LIconProps, LIconWeight } from "../../../../types";

interface LIconBaseProps extends LIconProps {
	weights: Map<LIconWeight, ReactElement>;
}

const LSSRBase = forwardRef<SVGSVGElement, LIconBaseProps>((props, ref) => {
	const {
		alt,
		color = "currentColor",
		size = "1em",
		weight = "bold",
		mirrored = false,
		children,
		weights,
		...restProps
	} = props;

	return (
		<svg
			ref={ref}
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			fill={color}
			viewBox="0 0 256 256"
			transform={mirrored ? "scale(-1, 1)" : undefined}
			{...restProps}
		>
			{!!alt && <title>{alt}</title>}
			{children}
			{weights.get(weight)}
		</svg>
	);
});

LSSRBase.displayName = "LSSRBase";

export default LSSRBase;
