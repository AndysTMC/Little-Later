import { useMemo } from "react";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useOutletContext } from "react-router";
import { LUIBasicNav } from "../LUINavs/LUIBasicNav/Component";
import { LUINoteDetailForm } from "../LUINoteDetailForm/Component";
import type { HomeData } from "../../records";
import { collectProfileTags } from "../../../utils/tags";

const Component = () => {
	const { currentUserProfile, links, notes, reminders, tasks, pages } =
		useOutletContext<HomeData>();
	const { theme } = useTheme();
	const saves = useMemo(() => pages.filter((page) => page.saved), [pages]);
	const tagSuggestions = useMemo(
		() => collectProfileTags([saves, tasks, reminders, notes]),
		[saves, tasks, reminders, notes],
	);

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
