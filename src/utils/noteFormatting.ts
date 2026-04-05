type NoteSelection = {
	start: number;
	end: number;
};

type NoteFormattingAction =
	| "bold"
	| "italic"
	| "underline"
	| "strikethrough"
	| "h1"
	| "h2"
	| "bullet"
	| "numbered"
	| "checklist"
	| "quote"
	| "inlineCode"
	| "codeBlock"
	| "link";

type NoteFormattingResult = {
	content: string;
	selection: NoteSelection;
};

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

const normalizeSelection = (
	content: string,
	selection: NoteSelection,
): NoteSelection => {
	const boundedStart = clamp(selection.start, 0, content.length);
	const boundedEnd = clamp(selection.end, 0, content.length);
	return boundedStart <= boundedEnd
		? { start: boundedStart, end: boundedEnd }
		: { start: boundedEnd, end: boundedStart };
};

const replaceRange = (
	content: string,
	start: number,
	end: number,
	replacement: string,
): string => content.slice(0, start) + replacement + content.slice(end);

const wrapSelection = (
	content: string,
	selection: NoteSelection,
	prefix: string,
	suffix: string,
	placeholder: string,
): NoteFormattingResult => {
	const safeSelection = normalizeSelection(content, selection);
	const selectedText = content.slice(safeSelection.start, safeSelection.end);
	if (selectedText !== "") {
		const replacement = `${prefix}${selectedText}${suffix}`;
		return {
			content: replaceRange(
				content,
				safeSelection.start,
				safeSelection.end,
				replacement,
			),
			selection: {
				start: safeSelection.start + prefix.length,
				end: safeSelection.start + prefix.length + selectedText.length,
			},
		};
	}
	const replacement = `${prefix}${placeholder}${suffix}`;
	const updatedContent = replaceRange(
		content,
		safeSelection.start,
		safeSelection.end,
		replacement,
	);
	return {
		content: updatedContent,
		selection: {
			start: safeSelection.start + prefix.length,
			end: safeSelection.start + prefix.length + placeholder.length,
		},
	};
};

const formatSelectedLines = (
	content: string,
	selection: NoteSelection,
	prefixForLine: (lineIndex: number) => string,
): NoteFormattingResult => {
	const safeSelection = normalizeSelection(content, selection);
	const blockStart = content.lastIndexOf("\n", safeSelection.start - 1) + 1;
	const blockEndIndex = content.indexOf("\n", safeSelection.end);
	const blockEnd = blockEndIndex === -1 ? content.length : blockEndIndex;
	const block = content.slice(blockStart, blockEnd);
	const lines = block.split("\n");
	const prefixedBlock = lines
		.map((line, index) => `${prefixForLine(index)}${line}`)
		.join("\n");
	return {
		content: replaceRange(content, blockStart, blockEnd, prefixedBlock),
		selection: {
			start: blockStart,
			end: blockStart + prefixedBlock.length,
		},
	};
};

const applyNoteFormatting = (
	content: string,
	selection: NoteSelection,
	action: NoteFormattingAction,
): NoteFormattingResult => {
	if (action === "bold") {
		return wrapSelection(content, selection, "**", "**", "bold text");
	}
	if (action === "italic") {
		return wrapSelection(content, selection, "_", "_", "italic text");
	}
	if (action === "underline") {
		return wrapSelection(content, selection, "<u>", "</u>", "underlined text");
	}
	if (action === "strikethrough") {
		return wrapSelection(content, selection, "~~", "~~", "struck text");
	}
	if (action === "inlineCode") {
		return wrapSelection(content, selection, "`", "`", "code");
	}
	if (action === "link") {
		return wrapSelection(content, selection, "[", "](https://example.com)", "link");
	}
	if (action === "codeBlock") {
		const safeSelection = normalizeSelection(content, selection);
		const selectedText =
			content.slice(safeSelection.start, safeSelection.end) || "code";
		const replacement = `\`\`\`\n${selectedText}\n\`\`\``;
		const updatedContent = replaceRange(
			content,
			safeSelection.start,
			safeSelection.end,
			replacement,
		);
		const blockStart = safeSelection.start + 4;
		return {
			content: updatedContent,
			selection: {
				start: blockStart,
				end: blockStart + selectedText.length,
			},
		};
	}
	if (action === "h1") {
		return formatSelectedLines(content, selection, () => "# ");
	}
	if (action === "h2") {
		return formatSelectedLines(content, selection, () => "## ");
	}
	if (action === "bullet") {
		return formatSelectedLines(content, selection, () => "- ");
	}
	if (action === "numbered") {
		return formatSelectedLines(content, selection, (lineIndex) => `${lineIndex + 1}. `);
	}
	if (action === "checklist") {
		return formatSelectedLines(content, selection, () => "- [ ] ");
	}
	return formatSelectedLines(content, selection, () => "> ");
};

export { applyNoteFormatting };
export type { NoteSelection, NoteFormattingAction, NoteFormattingResult };
