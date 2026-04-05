import { forwardRef } from "react";
import { LIcon } from "../../../../types";
import LIconBase from "../lib/LIconBase";
import weights from "../defs/LVBM";

const Icon: LIcon = forwardRef((props, ref) => (
	<LIconBase ref={ref} {...props} weights={weights} />
));

Icon.displayName = "LVBMIcon";
export { Icon as LVBMIcon };

