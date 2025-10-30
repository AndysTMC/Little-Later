import {
	LFrowningFaceIcon,
	LSlightlySmilingFaceIcon,
	LThinkingFaceIcon,
} from "./popup/components/LUIIcons";
import {
	CheckCircleIcon,
	InfoIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react";
import { LFACE_EXPRESSION, LTOAST_TYPE } from "little-shared/enums";

export const LFACEEXPRESSION_TO_ICON = {
	[LFACE_EXPRESSION.SLIGHTLY_SMILING]: LSlightlySmilingFaceIcon,
	[LFACE_EXPRESSION.THINKING]: LThinkingFaceIcon,
	[LFACE_EXPRESSION.FROWNING]: LFrowningFaceIcon,
};

export const LTOAST_TYPE_TO_ICON = {
	[LTOAST_TYPE.SUCCESS]: CheckCircleIcon,
	[LTOAST_TYPE.ERROR]: XCircleIcon,
	[LTOAST_TYPE.INFO]: InfoIcon,
	[LTOAST_TYPE.WARNING]: WarningCircleIcon,
};
