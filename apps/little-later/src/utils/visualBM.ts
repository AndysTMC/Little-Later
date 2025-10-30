import { LDate, LVisualBM } from "little-shared/types";
import { LDateUtl } from "../../../../packages/shared/src/utils/datetime";

export const searchSavesByText = (
	saves: Array<LVisualBM>,
	textToSearchWith: string,
): Array<LVisualBM> => {
	const filteredSaves = saves.filter(
		(save) =>
			(save.customName + save.url + save.title)
				.toLowerCase()
				.includes(textToSearchWith.toLowerCase()) && save.isSaved,
	);
	return filteredSaves;
};

export const getLastSeenInfo = (date: LDate): string => {
	if (LDateUtl.fromToday(date)) {
		return "Today";
	} else if (LDateUtl.fromYesterday(date)) {
		return "Yesterday";
	} else if (LDateUtl.fromThisWeek(date)) {
		return `Current week on ${LDateUtl.getPrettyDate(date)}`;
	} else if (LDateUtl.fromThisMonth(date)) {
		return `Current Month`;
	} else if (LDateUtl.fromThisYear(date)) {
		return `Current Year`;
	} else {
		return "Older";
	}
};
