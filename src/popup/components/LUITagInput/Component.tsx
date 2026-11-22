import { useMemo, useState } from "react";
import { PlusIcon, XIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import {
	MAX_TAGS_PER_RECORD,
	MAX_TAG_LENGTH,
	normalizeTag,
} from "../../../utils/tags";

const Component = ({
	tags,
	onChange,
	suggestions = [],
	className,
}: {
	tags: ReadonlyArray<string>;
	onChange: (nextTags: Array<string>) => void;
	suggestions?: ReadonlyArray<string>;
	className?: string;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const [draft, setDraft] = useState("");

	const addTag = (raw: string) => {
		const normalized = normalizeTag(raw);
		if (
			normalized === "" ||
			tags.includes(normalized) ||
			tags.length >= MAX_TAGS_PER_RECORD
		) {
			setDraft("");
			return;
		}
		onChange([...tags, normalized]);
		setDraft("");
	};

	const removeTag = (tag: string) => {
		onChange(tags.filter((item) => item !== tag));
	};

	const availableSuggestions = useMemo(() => {
		const needle = normalizeTag(draft);
		return suggestions
			.filter(
				(item) =>
					!tags.includes(item) &&
					(needle === "" || item.includes(needle)),
			)
			.slice(0, 6);
	}, [suggestions, tags, draft]);

	const atLimit = tags.length >= MAX_TAGS_PER_RECORD;

	return (
		<div
			className={twMerge(
				"my-1 flex h-max w-full flex-col gap-y-1.5",
				className,
			)}
		>
			<div className="flex items-center justify-between px-0.5">
				<span
					className={`text-xs font-medium ${
						isDark ? "text-neutral-400" : "text-neutral-600"
					}`}
				>
					Tags
				</span>
				<span
					className={`text-[11px] tabular-nums ${
						isDark ? "text-neutral-500" : "text-neutral-500"
					}`}
				>
					{tags.length}/{MAX_TAGS_PER_RECORD}
				</span>
			</div>

			{tags.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{tags.map((tag) => (
						<span
							key={tag}
							className={`inline-flex items-center gap-x-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs font-medium ${
								isDark
									? "border-neutral-700 bg-neutral-900 text-neutral-200"
									: "border-neutral-300 bg-neutral-100 text-neutral-800"
							}`}
						>
							<span>#{tag}</span>
							<button
								type="button"
								aria-label={`Remove tag ${tag}`}
								onClick={() => removeTag(tag)}
								className={`flex size-4 cursor-pointer items-center justify-center rounded-full transition-colors ${
									isDark
										? "text-neutral-400 hover:bg-neutral-800 hover:text-white"
										: "text-neutral-500 hover:bg-neutral-200 hover:text-black"
								}`}
							>
								<LUIThemedIcon
									Icon={XIcon}
									color="currentColor"
									weight="bold"
									className="size-2.5"
								/>
							</button>
						</span>
					))}
				</div>
			) : null}

			{!atLimit ? (
				<div className="flex items-center gap-x-1.5">
					<input
						type="text"
						value={draft}
						maxLength={MAX_TAG_LENGTH + 1}
						aria-label="Add tag"
						placeholder="Add a tag (press Enter)"
						onChange={(event) => {
							const value = event.target.value;
							if (value.endsWith(",")) {
								addTag(value.slice(0, -1));
							} else {
								setDraft(value);
							}
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								addTag(draft);
							} else if (
								event.key === "Backspace" &&
								draft === "" &&
								tags.length > 0
							) {
								removeTag(tags[tags.length - 1]);
							}
						}}
						className={`h-9 min-w-0 grow rounded-xl border px-3 text-xs transition-colors outline-none ${
							isDark
								? "border-neutral-700 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400"
								: "border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-600"
						}`}
					/>
					<button
						type="button"
						aria-label="Add tag button"
						disabled={normalizeTag(draft) === ""}
						onClick={() => addTag(draft)}
						className={`flex h-9 shrink-0 cursor-pointer items-center gap-x-1 rounded-xl border px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
							isDark
								? "border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
								: "border-neutral-300 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
						}`}
					>
						<LUIThemedIcon
							Icon={PlusIcon}
							color="currentColor"
							weight="bold"
							className="size-3.5"
						/>
						<span>Add</span>
					</button>
				</div>
			) : null}

			{!atLimit && availableSuggestions.length > 0 ? (
				<div className="flex flex-wrap items-center gap-1 pt-0.5">
					{availableSuggestions.map((tag) => (
						<button
							key={tag}
							type="button"
							onClick={() => addTag(tag)}
							className={`cursor-pointer rounded-full border border-dashed px-2 py-0.5 text-[11px] transition-colors ${
								isDark
									? "border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
									: "border-neutral-300 text-neutral-500 hover:border-neutral-500 hover:text-neutral-800"
							}`}
						>
							+ #{tag}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
};

export { Component as LUITagInput };
