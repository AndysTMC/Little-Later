import { createContext } from "react";
import type { LIconProps } from "../../../../types";

export const LIconContext = createContext<LIconProps>({
	color: "currentColor",
	size: "1em",
	weight: "bold",
	mirrored: false,
});
