import { useTheme } from "../../hooks/useTheme";
import { LNote } from "little-shared/types";
import { LTHEME } from "little-shared/enums";
import { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import { twMerge } from "tailwind-merge";

const Component = ({
	className,
	note,
}: {
	className?: string;
	note: LNote;
}) => {
	const { theme } = useTheme();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const adjustHeight = () => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	};

	useEffect(() => {
		setTimeout(() => {
			adjustHeight();
		}, 1);
		if (textareaRef.current) {
			textareaRef.current.value = note.content;
		}
	}, [note, note.content]);

	return (
		<div
			ref={containerRef}
			className={twMerge(
				`h-max w-full border ${theme === LTHEME.DARK ? "bg-neutral-800" : "bg-neutral-200"} overflow-clip rounded-lg border-transparent transition-all duration-300 ${theme === LTHEME.DARK ? "caret-white" : "caret-black"} cursor-text`,
				className,
			)}
		>
			<div className="h-max w-full">
				<div
					className={`h-max w-full overflow-x-hidden px-2 py-2 break-all ${theme === LTHEME.DARK ? "caret-black" : "caret-white"} ${
						note.content.length > 0
							? theme === LTHEME.DARK
								? "text-white"
								: "text-black"
							: "text-neutral-500 opacity-50"
					} `}
				>
					<Markdown>
						{note.content.length > 0
							? note.content.replace(/\n/g, "  \n")
							: "Empty"}
					</Markdown>
				</div>
			</div>
		</div>
	);
};

export { Component as LUINoteNoEdit };
