import { forwardRef } from "react";
import { LIcon } from "../../../../types";
import LSSRBase from "../lib/LSSRBase";
import weights from "../defs/LSave";

const Icon: LIcon = forwardRef((props, ref) => (
	<LSSRBase ref={ref} {...props} weights={weights} />
));

Icon.displayName = "SaveIcon";
export { Icon as SaveIcon };
