import { forwardRef } from "react";
import { LIcon } from "../../../../types";
import LSSRBase from "../lib/LSSRBase";
import weights from "../defs/LFrowningFace";

const Icon: LIcon = forwardRef((props, ref) => (
	<LSSRBase ref={ref} {...props} weights={weights} />
));

Icon.displayName = "LFrowningFaceIcon";
export { Icon as LFrowningFaceIcon };
