import { forwardRef } from "react";
import { LIcon } from "../../../../types";
import LSSRBase from "../lib/LSSRBase";
import weights from "../defs/LVBM";

const Icon: LIcon = forwardRef((props, ref) => (
	<LSSRBase ref={ref} {...props} weights={weights} />
));

Icon.displayName = "LVBMIcon";
export { Icon as LVBMIcon };

