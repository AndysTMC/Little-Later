import { useState } from "react";
import { LittleNavigation } from "../../types";

const useLittleNavigation = () => {
	const [littleNavigation, setLittleNavigation] = useState<LittleNavigation>({
		exit: {},
		navigateTo: null,
		navigateOptions: {},
	});

	return { littleNavigation, setLittleNavigation };
};

export { useLittleNavigation };
