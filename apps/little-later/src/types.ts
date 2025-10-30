import { IconProps } from "@phosphor-icons/react";
import { MotionProps } from "framer-motion";
import { ReactNode, ComponentPropsWithoutRef, RefAttributes } from "react";
import { To, NavigateOptions } from "react-router";
import { WriterFormat, WriterLength, WriterTone } from "./utils/ai/Writer";
import {
	RewriterTone,
	RewriterFormat,
	RewriterLength,
} from "./utils/ai/Rewriter";
import {
	SummarizerFormat,
	SummarizerLength,
	SummarizerType,
} from "./utils/ai/Summarizer";

export type ContextProviderProps = {
	children: ReactNode;
};

export type IconComponentType = React.ComponentType<IconProps>;

export type LIcon = React.ForwardRefExoticComponent<LIconProps>;

export type LIconComponentType = React.ComponentType<LIconProps>;

export interface LIconProps
	extends ComponentPropsWithoutRef<"svg">,
		RefAttributes<SVGSVGElement> {
	alt?: string;
	color?: string;
	size?: string | number;
	weight?: LIconWeight;
	mirrored?: boolean;
}

export type LIconWeight =
	| "thin"
	| "light"
	| "regular"
	| "bold"
	| "fill"
	| "duotone";

export type LittleNavigation = {
	exit: MotionProps;
	navigateTo?: To | null;
	navigateOptions?: NavigateOptions;
};

export type LittleTransition = {
	entry: MotionProps;
	setEntry: (entry: MotionProps) => void;
	exit: MotionProps;
	setExit: (exit: MotionProps) => void;
};

export type Validation = {
	success: boolean;
	error: string;
};

export type LWriteOptions = {
	tone?: WriterTone;
	format?: WriterFormat;
	length?: WriterLength;
	sharedContext?: string;
};

export type LRewriteOptions = {
	tone?: RewriterTone;
	format?: RewriterFormat;
	length?: RewriterLength;
	sharedContext?: string;
};

export type LSummarizeOptions = {
	type?: SummarizerType;
	format?: SummarizerFormat;
	length?: SummarizerLength;
	sharedContext?: string;
};
