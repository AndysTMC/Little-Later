import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useLocation, useOutletContext } from "react-router";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { LUIBasicNav } from "../LUINavs/LUIBasicNav/Component";
import { LUITaskForm } from "../LUITaskForm/Component";
import type { HomeData } from "../../records";

const Component = () => {
	const { links, reminders, pages } = useOutletContext<HomeData>();
	const { theme } = useTheme();
	const go = useMoveNavigate();
	const location = useLocation();
	const prelinkedSaveId =
		typeof location.state?.passedSaveId === "string"
			? location.state.passedSaveId
			: undefined;

	const additionalSubmitCallback = () => {
		// The panel closes over the list.
		go("/home", "sink");
	};
	const saves = pages.filter((page) => page.saved);
	return (
		<div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"}`}
		>
			<LUIBasicNav goBackDisabled />
			<LUITaskForm
				links={links}
				reminders={reminders}
				saves={saves}
				prelinkedSaveId={prelinkedSaveId}
				additionalSubmitCallback={additionalSubmitCallback}
			/>
		</div>
	);
};

export { Component as LUITaskCreator };
