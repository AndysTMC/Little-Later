import { prettyTime, zoned } from "./dates";

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

// "Apr 5 5:35 PM" in the device's zone.
const getNoteCardTimeLabel = (ms: number): string => {
	const date = zoned(ms);
	const month = date.toLocaleString("en-US", { month: "short" });
	return `${month} ${date.day} ${prettyTime(date)}`;
};

export { getNoteCardTitleAndSnippet, getNoteCardTimeLabel };
