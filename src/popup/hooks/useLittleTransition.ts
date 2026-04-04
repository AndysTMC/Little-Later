import { entryTransitions, exitTransitions } from "../../route-transitions";
import { MotionProps } from "framer-motion";
import { useState } from "react";
import { useLocation } from "react-router";

const useLittleTransition = ({
	transitionName = "entryTransition",
	defaultEntry,
	defaultExit,
}: {
	transitionName?: string;
	defaultEntry?: MotionProps;
	defaultExit?: MotionProps;
}) => {
	const location = useLocation();
	const [entry, setEntry] = useState<MotionProps>(
		location.state?.[transitionName] ||
			defaultEntry ||
			entryTransitions.none,
	);
	const [exit, setExit] = useState<MotionProps>(
		defaultExit || exitTransitions.none,
	);

	return { entry, setEntry, exit, setExit };
};

export { useLittleTransition };
