import { useMemo } from "react";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useLocation, useOutletContext } from "react-router";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { LUIBasicNav } from "../LUINavs/LUIBasicNav/Component";
import { LUITaskForm } from "../LUITaskForm/Component";
import { useProfileTags } from "../../hooks/useRecords";
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
	const saves = useMemo(() => pages.filter((page) => page.saved), [pages]);
	const tagSuggestions = useProfileTags();
	return (
		<div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"}`}
		>
			<LUIBasicNav goBackDisabled />
			<LUITaskForm
				links={links}
				reminders={reminders}
				saves={saves}
				tagSuggestions={tagSuggestions}
				prelinkedSaveId={prelinkedSaveId}
				additionalSubmitCallback={additionalSubmitCallback}
			/>
		</div>
	);
};

export { Component as LUITaskCreator };
