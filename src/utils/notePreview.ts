import { LDate } from "little-shared/types";
import { LDateUtl } from "little-shared/utils/datetime";

const cleanPreviewLine = (line: string): string => {
	return line
		.replace(/^#{1,6}\s+/, "")
		.replace(/^\s*>\s?/, "")
		.replace(/^\s*[-*+]\s+/, "")
		.replace(/^\s*\d+\.\s+/, "")
		.replace(/^\s*-\s\[[ xX]\]\s+/, "")
		.replace(/[*_~`]/g, "")
		.trim();
};

const getNoteCardTitleAndSnippet = (
	content: string,
): { title: string; snippet: string } => {
	const cleanedLines = content
		.split(/\r?\n/)
		.map(cleanPreviewLine)
		.filter((line) => line !== "");

	if (cleanedLines.length === 0) {
		return {
			title: "Untitled note",
			snippet: "Tap to add details.",
		};
	}

	const [title, ...rest] = cleanedLines;
	return {
		title,
		snippet: rest.join(" "),
	};
};

const getNoteCardTimeLabel = (date: LDate): string => {
	const month = LDateUtl.getMonthName(LDateUtl.getMonth(date)).slice(0, 3);
	const day = LDateUtl.getDay(date);
	const hour = LDateUtl.getHour12HF(date);
	const minute = LDateUtl.getMinute(date).toString().padStart(2, "0");
	const meridiem = LDateUtl.getMerideum(date);
	return `${month} ${day} ${hour}:${minute} ${meridiem}`;
};

export { getNoteCardTitleAndSnippet, getNoteCardTimeLabel };
