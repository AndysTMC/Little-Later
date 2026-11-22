import {
	ArrowClockwiseIcon,
	ArrowCounterClockwiseIcon,
	CaretDownIcon,
	CheckIcon,
	CopyIcon,
	DownloadSimpleIcon,
	GearSixIcon,
	LinkSimpleIcon,
	SparkleIcon,
	WrenchIcon,
} from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StoredAIOutput } from "../storage/repositories";
import { useTheme } from "../popup/hooks/useTheme";
import { attempt } from "../popup/attempt";
import { isInlineImageAllowed } from "../popup/markdownUrl";
import { CONFIRMATION_ICON } from "./icons";
import { Markdown } from "./Markdown";
import { send } from "../utils/send";
import { useNow } from "./hooks";
import { withoutThinking } from "./text";
import { TextAction } from "./ui";
import { openAISettings } from "./links";

// Matches fenced code blocks, inline code spans, or markdown images in one
// pass so image examples inside code stay untouched.
const CODE_OR_IMAGE =
	/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)|!\[([^\]]*)\]\(([^)]+)\)/g;

const imageExtension = (src: string): string => {
	const match = /^data:image\/(png|jpeg|webp|gif)[;,]/i.exec(src);
	if (!match) return "png";
	const subtype = match[1].toLowerCase();
	return subtype === "jpeg" ? "jpg" : subtype;
};

// Images the answer shows (a saved page's preview) come out of the text
// and are drawn under it; any other image stays a plain link.
const splitImages = (message: string) => {
	const images: Array<{ alt: string; src: string }> = [];
	const markdown = withoutThinking(message)
		.replace(
			CODE_OR_IMAGE,
			(match, code: string | undefined, alt: string, src: string) => {
				if (code !== undefined) return match;
				const url =
					src.trim().replace(/^<|>$/g, "").split(/\s+/)[0] ?? "";
				if (!isInlineImageAllowed(url)) return match;
				images.push({ alt: alt.trim() || "Image", src: url });
				return "";
			},
		)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	return { markdown, images };
};

const ImageAttachment = ({ src, alt }: { src: string; alt: string }) => {
	const { theme } = useTheme();
	const openImage = async () => {
		if (!src.startsWith("data:")) {
			window.open(src, "_blank", "noopener,noreferrer");
			return;
		}
		// Chrome blocks top-frame navigation to data: URLs; open a Blob URL.
		const blob = await (await fetch(src)).blob();
		const url = URL.createObjectURL(blob);
		window.open(url, "_blank", "noopener,noreferrer");
		setTimeout(() => URL.revokeObjectURL(url), 60_000);
	};
	const download = () => {
		const link = document.createElement("a");
		link.href = src;
		link.download = `${alt.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "image"}.${imageExtension(src)}`;
		link.click();
	};
	return (
		<figure className="flex flex-col gap-y-1">
			<img
				src={src}
				alt={alt}
				draggable={false}
				className={`max-h-72 w-auto max-w-full rounded-xl border ${theme === LTHEME.DARK ? "border-neutral-800" : "border-neutral-200"}`}
			/>
			<div className="-ml-2 flex">
				<TextAction
					label="Open"
					icon={LinkSimpleIcon}
					onClick={() => void openImage()}
				/>
				<TextAction
					label="Download"
					icon={DownloadSimpleIcon}
					onClick={download}
				/>
			</div>
		</figure>
	);
};

// What LittleAI did for this answer, folded into one line.
const Steps = ({ steps }: { steps: ReadonlyArray<string> }) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const [open, setOpen] = useState(false);
	if (steps.length === 1) {
		return (
			<div
				className={`-ml-1 flex w-max items-center gap-x-1 px-1 text-xs ${dark ? "text-neutral-400" : "text-neutral-500"}`}
			>
				<WrenchIcon aria-hidden weight="regular" className="size-3.5" />
				{steps[0]}
			</div>
		);
	}
	return (
		<div className="-ml-1 flex flex-col">
			<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen(!open)}
				className={`flex w-max cursor-pointer items-center gap-x-1 rounded-lg px-1.5 py-0.5 text-xs transition-colors ${dark ? "text-neutral-400 hover:bg-neutral-900 hover:text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-black"}`}
			>
				<WrenchIcon aria-hidden weight="regular" className="size-3.5" />
				{`Used ${steps.length} tools`}
				<CaretDownIcon
					aria-hidden
					weight="regular"
					className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>
			{open ? (
				<ul
					className={`mt-1 ml-2 flex flex-col gap-y-0.5 border-l pl-3 text-xs ${dark ? "border-neutral-800 text-neutral-400" : "border-neutral-200 text-neutral-500"}`}
				>
					{steps.map((step, index) => (
						<li key={`${step}-${index}`}>{step}</li>
					))}
				</ul>
			) : null}
		</div>
	);
};

// The changes LittleAI asked to make, as the conversation keeps them once
// they were approved or cancelled. The summaries are the app's own words.
const AskedApproval = ({
	confirmation,
}: {
	confirmation: NonNullable<StoredAIOutput["confirmation"]>;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const items = Array.isArray(confirmation.items) ? confirmation.items : [];
	return (
		<div className="flex flex-col gap-y-1">
			<span
				className={`text-xs ${dark ? "text-neutral-400" : "text-neutral-500"}`}
			>
				Asked for approval
			</span>
			<ul className="flex flex-col gap-y-1">
				{items.map((item, index) => {
					const Icon =
						CONFIRMATION_ICON[item.kind] ??
						CONFIRMATION_ICON.mutate;
					return (
						<li
							key={`${item.toolName}-${item.summary}-${index}`}
							className="flex items-start gap-x-2 text-sm"
						>
							<Icon
								aria-hidden
								weight="bold"
								className={`mt-0.5 size-4 shrink-0 ${dark ? "text-neutral-400" : "text-neutral-500"}`}
							/>
							<span>{item.summary}</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
};

// One of LittleAI's answers. The newest one, while nothing runs, offers
// what can follow it: undoing a change, copying, another answer, or, when
// no model is set up, the way to set one up. What it waits on (a question,
// an approval) is docked above the input; while it is, the answer leaves
// it to the box rather than saying it twice.
const Answer = ({
	chatId,
	output,
	isLatest,
	idle,
	docked,
	onRegenerate,
	onOpenSettings = openAISettings,
}: {
	chatId: string;
	output: StoredAIOutput;
	isLatest: boolean;
	idle: boolean;
	docked: boolean;
	onRegenerate: (() => void) | null;
	onOpenSettings?: () => void;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const [copied, setCopied] = useState(false);
	const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (copiedTimer.current) clearTimeout(copiedTimer.current);
		},
		[],
	);
	const { markdown, images } = useMemo(
		() => splitImages(output.message),
		[output.message],
	);
	const live = isLatest && idle;
	const now = useNow(15_000, live && output.undo !== undefined);
	const canUndo =
		live && output.undo !== undefined && output.undo.until > now;
	const needsSetup = /AI is not configured/i.test(output.message);
	const steps = output.steps ?? [];
	if (docked && steps.length === 0) return null;

	const showActions = !output.confirmation && !output.question;
	const showAnyAction =
		showActions &&
		(markdown !== "" ||
			(live && (canUndo || needsSetup || onRegenerate !== null)));

	return (
		<article className="group flex w-full gap-x-3">
			<span
				aria-hidden
				className="ll-accent-fill mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
			>
				<SparkleIcon weight="fill" className="size-3.5" />
			</span>
			<div
				className={`flex min-w-0 grow flex-col gap-y-2 text-[15px] leading-relaxed wrap-break-word ${dark ? "text-neutral-100" : "text-neutral-900"}`}
			>
				{steps.length > 0 ? <Steps steps={steps} /> : null}
				{docked ? null : output.confirmation ? (
					<AskedApproval confirmation={output.confirmation} />
				) : (
					<>
						{markdown !== "" ? <Markdown text={markdown} /> : null}
						{images.map((image, index) => (
							<ImageAttachment
								key={`${image.src}-${index}`}
								src={image.src}
								alt={image.alt}
							/>
						))}
					</>
				)}
				{showAnyAction ? (
					<div
						className={`-ml-2 flex flex-wrap transition-opacity ${live ? "opacity-100" : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"}`}
					>
						{markdown !== "" ? (
							<TextAction
								label={copied ? "Copied" : "Copy"}
								icon={copied ? CheckIcon : CopyIcon}
								onClick={() => {
									void navigator.clipboard
										.writeText(markdown)
										.then(() => {
											setCopied(true);
											if (copiedTimer.current) {
												clearTimeout(
													copiedTimer.current,
												);
											}
											copiedTimer.current = setTimeout(
												() => setCopied(false),
												2_000,
											);
										})
										.catch(() => undefined);
								}}
							/>
						) : null}
						{live && canUndo ? (
							<TextAction
								label="Undo"
								icon={ArrowCounterClockwiseIcon}
								ariaLabel={`Undo ${output.undo!.label}`}
								onClick={() =>
									void attempt(() =>
										send("ai.undo", { chatId }),
									)
								}
							/>
						) : null}
						{live && needsSetup ? (
							<TextAction
								label="Set up AI"
								icon={GearSixIcon}
								onClick={onOpenSettings}
							/>
						) : null}
						{live && onRegenerate ? (
							<TextAction
								label="Regenerate"
								icon={ArrowClockwiseIcon}
								onClick={onRegenerate}
							/>
						) : null}
					</div>
				) : null}
			</div>
		</article>
	);
};

export { Answer };
