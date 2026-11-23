import { useMemo } from "react";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useOutletContext } from "react-router";
import { LUIBasicNav } from "../LUINavs/LUIBasicNav/Component";
import { LUINoteDetailForm } from "../LUINoteDetailForm/Component";
import { useProfileTags } from "../../hooks/useRecords";
import type { HomeData } from "../../records";

const Component = () => {
	const { currentUserProfile, links, pages } = useOutletContext<HomeData>();
	const { theme } = useTheme();
	const saves = useMemo(() => pages.filter((page) => page.saved), [pages]);
	const tagSuggestions = useProfileTags();

	return (
		<div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${
				theme === LTHEME.DARK ? "bg-black" : "bg-white"
			}`}
		>
			<LUIBasicNav goBackDisabled />
			<LUINoteDetailForm
				note={{
					id: null,
					content: "",
					locked: false,
					title: "",
					tags: [],
				}}
				links={links}
				saves={saves}
				tagSuggestions={tagSuggestions}
				canLock={currentUserProfile.hasPassword}
			/>
		</div>
	);
};

export { Component as LUINoteCreator };
