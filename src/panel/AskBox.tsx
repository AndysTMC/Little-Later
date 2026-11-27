import {
	QuestionIcon,
	ShieldCheckIcon,
	TrashIcon,
	XIcon,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { useEffect, useRef, useState } from "react";
import type { StoredAIOutput } from "../storage/repositories";
import { useTheme } from "../popup/hooks/useTheme";
import { MOTION } from "../route-transitions";
import { CONFIRMATION_ICON } from "./icons";
import { IconButton } from "./ui";

// What LittleAI is waiting on, docked above the input (decision 0017): a
// question with options, or a change to approve. Options are numbered and
// answer to their number keys, as in a terminal agent's prompt.

type Question = NonNullable<StoredAIOutput["question"]>;
type Confirmation = NonNullable<StoredAIOutput["confirmation"]>;

// One numbered choice.
const Option = ({
	index,
	label,
	tone = "default",
	onChoose,
	buttonRef,
}: {
	index: number;
	label: string;
	tone?: "default" | "accent" | "danger";
	onChoose: () => void;
	buttonRef?: (element: HTMLButtonElement | null) => void;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const badge =
		tone === "danger"
			? "bg-red-600 text-white"
			: tone === "accent"
				? "ll-accent-fill"
				: dark
					? "bg-neutral-800 text-neutral-200"
					: "bg-neutral-200 text-neutral-700";
	return (
		<button
			ref={buttonRef}
			type="button"
			onClick={onChoose}
			className={`group flex w-full cursor-pointer items-center gap-x-3 rounded-xl px-2 py-2 text-left text-sm transition-colors ${dark ? "hover:bg-neutral-800 focus-visible:bg-neutral-800" : "hover:bg-neutral-200 focus-visible:bg-neutral-200"} ${tone === "danger" ? "text-red-600" : ""}`}
		>
			<span
				aria-hidden
				className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${badge}`}
			>
				{index}
			</span>
			<span className="grow">{label}</span>
		</button>
	);
};

const Shell = ({
	label,
	icon: Icon,
	iconClassName,
	title,
	onDismiss,
	children,
}: {
	label: string;
	icon: typeof QuestionIcon;
	iconClassName?: string;
	title: string;
	onDismiss?: () => void;
	children: React.ReactNode;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	return (
		<motion.section
			aria-label={label}
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0, transition: MOTION.sheet }}
			exit={{ opacity: 0, y: 8, transition: MOTION.sheetExit }}
			className={`flex flex-col gap-y-2 rounded-2xl border p-3.5 shadow-sm ${dark ? "border-neutral-800 bg-neutral-900" : "border-neutral-200 bg-neutral-100"}`}
		>
			<div className="flex items-start gap-x-2">
				<Icon
					aria-hidden
					weight="fill"
					className={`mt-0.5 size-5 shrink-0 ${iconClassName ?? "text-[var(--ll-accent)]"}`}
				/>
				<h2 className="grow text-[15px] leading-snug font-medium">
					{title}
				</h2>
				{onDismiss ? (
					<IconButton
						size="sm"
						label="Dismiss"
						icon={XIcon}
						onClick={onDismiss}
					/>
				) : null}
			</div>
			{children}
		</motion.section>
	);
};

// Number keys pick options while focus isn't in a text field and no drawer
// covers the box.
const useNumberKeys = (choices: ReadonlyArray<() => void>, active = true) => {
	const latest = useRef(choices);
	useEffect(() => {
		latest.current = choices;
	});
	useEffect(() => {
		if (!active) return;
		const onKey = (event: KeyboardEvent) => {
			const target = event.target;
			if (
				(target instanceof Element &&
					target.closest("input, textarea, [contenteditable]")) ||
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				event.shiftKey
			) {
				return;
			}
			const index = Number(event.key) - 1;
			if (Number.isInteger(index) && latest.current[index]) {
				event.preventDefault();
				latest.current[index]();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [active]);
};

export const QuestionBox = ({
	question,
	active = true,
	onAnswer,
	onSomethingElse,
	onDismiss,
}: {
	question: Question;
	active?: boolean;
	onAnswer: (answer: string) => void;
	onSomethingElse: () => void;
	onDismiss: () => void;
}) => {
	const answers = question.options.map((option) => () => onAnswer(option));
	const choices = question.allowOther
		? [...answers, onSomethingElse]
		: answers;
	useNumberKeys(choices, active);
	return (
		<Shell
			label="Little AI's question"
			icon={QuestionIcon}
			title={question.question}
			onDismiss={onDismiss}
		>
			<div className="flex flex-col">
				{question.options.map((option, index) => (
					<Option
						key={`${option}-${index}`}
						index={index + 1}
						label={option}
						onChoose={() => onAnswer(option)}
					/>
				))}
				{question.allowOther ? (
					<Option
						index={question.options.length + 1}
						label="Something else…"
						onChoose={onSomethingElse}
					/>
				) : null}
			</div>
		</Shell>
	);
};

export const ApprovalBox = ({
	confirmation,
	active = true,
	onConfirm,
	onCancel,
}: {
	confirmation: Confirmation;
	active?: boolean;
	onConfirm: (password: string | null) => void;
	onCancel: () => void;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const [password, setPassword] = useState("");
	const items = Array.isArray(confirmation.items) ? confirmation.items : [];
	const destructive = items.some((item) => item.kind === "destructive");
	const ready = !confirmation.requiresPassword || password.trim() !== "";
	const confirm = () => {
		if (ready) onConfirm(confirmation.requiresPassword ? password : null);
	};
	useNumberKeys([confirm, onCancel], active);
	return (
		<Shell
			label="Change waiting for approval"
			icon={destructive ? TrashIcon : ShieldCheckIcon}
			iconClassName={destructive ? "text-red-600" : undefined}
			title={
				destructive ? "Approve this deletion?" : "Approve this change?"
			}
		>
			{items.length > 0 ? (
				<ul
					className={`flex flex-col gap-y-1.5 rounded-xl border px-3 py-2 ${dark ? "border-neutral-800 bg-black" : "border-neutral-200 bg-white"}`}
				>
					{items.map((item, index) => {
						const Icon =
							CONFIRMATION_ICON[item.kind] ??
							CONFIRMATION_ICON.mutate;
						return (
							<li
								key={`${item.toolName}-${item.summary}-${index}`}
								className={`flex items-start gap-x-2 text-sm ${item.kind === "destructive" ? "text-red-600" : dark ? "text-neutral-200" : "text-neutral-800"}`}
							>
								<Icon
									aria-hidden
									weight="bold"
									className="mt-0.5 size-4 shrink-0"
								/>
								<span>{item.summary}</span>
							</li>
						);
					})}
				</ul>
			) : null}
			{confirmation.requiresPassword ? (
				<input
					type="password"
					autoFocus
					aria-label="Backup password"
					placeholder="Backup password"
					autoComplete="off"
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					onKeyDown={(event) => {
						if (event.nativeEvent.isComposing) return;
						if (event.key === "Enter") confirm();
					}}
					className={`ll-field h-10 w-full rounded-xl border px-3 text-sm ${dark ? "border-neutral-800 bg-black text-white placeholder:text-neutral-500" : "border-neutral-200 bg-white text-black placeholder:text-neutral-500"}`}
				/>
			) : null}
			<div className="flex flex-col">
				<button
					type="button"
					aria-label={
						destructive ? "Confirm delete" : "Confirm change"
					}
					disabled={!ready}
					onClick={confirm}
					className={`flex w-full cursor-pointer items-center gap-x-3 rounded-xl px-2 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${destructive ? "text-red-600" : ""} ${dark ? "hover:bg-neutral-800 focus-visible:bg-neutral-800" : "hover:bg-neutral-200 focus-visible:bg-neutral-200"}`}
				>
					<span
						aria-hidden
						className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${destructive ? "bg-red-600 text-white" : "ll-accent-fill"}`}
					>
						1
					</span>
					{destructive ? "Yes, delete" : "Yes, make the change"}
				</button>
				<Option index={2} label="No, cancel" onChoose={onCancel} />
			</div>
		</Shell>
	);
};
