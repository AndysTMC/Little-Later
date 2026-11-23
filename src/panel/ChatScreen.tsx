import {
	ArrowClockwiseIcon,
	ArrowDownIcon,
	ArrowLeftIcon,
	ArrowUpIcon,
	BrowserIcon,
	CalendarCheckIcon,
	CaretUpDownIcon,
	CheckCircleIcon,
	CheckIcon,
	CircleNotchIcon,
	ClockCounterClockwiseIcon,
	GearSixIcon,
	ListChecksIcon,
	ListIcon,
	MagnifyingGlassIcon,
	NoteIcon,
	NotePencilIcon,
	PencilSimpleIcon,
	PlusIcon,
	SparkleIcon,
	StopIcon,
	XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { LAI_PROVIDERS, LTHEME } from "little-shared/enums";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { flushSync } from "react-dom";
import {
	fetchProviderModels,
	isAISettingsConfigured,
	isCloudModel,
} from "../services/ai/config";
import { isReadablePage, type PageRef } from "../services/ai/pages";
import type { RunStatus } from "../services/ai/runStatus";
import type { ProfileKeys } from "../storage/keys";
import type { ChatMessage, StoredAIOutput } from "../storage/repositories";
import { useCurrentUserProfile } from "../popup/hooks/useCurrentUserProfile";
import { useCurrentUserSettings } from "../popup/hooks/useCurrentUserSettings";
import { useTheme } from "../popup/hooks/useTheme";
import { LUILogo } from "../popup/components/LUILogo/Component";
import { attempt } from "../popup/attempt";
import { isInlineImageAllowed } from "../popup/markdownUrl";
import { send } from "../utils/send";
import { Answer } from "./Answer";
import { ApprovalBox, QuestionBox } from "./AskBox";
import { History } from "./History";
import { Markdown } from "./Markdown";
import {
	useActiveWebTab,
	useChatMessages,
	useChats,
	useRunStatus,
	type WebTab,
} from "./hooks";
import { openAISettings } from "./links";
import { withoutThinking } from "./text";
import { IconButton, TextAction } from "./ui";

const IDEAS = [
	{ icon: CalendarCheckIcon, text: "What's due this week?" },
	{ icon: ListChecksIcon, text: "Find my pending high priority tasks." },
	{ icon: ClockCounterClockwiseIcon, text: "What did I browse recently?" },
	{ icon: NoteIcon, text: "Summarize my notes about projects." },
	{ icon: CalendarCheckIcon, text: "What reminders are due today?" },
	{ icon: ListChecksIcon, text: "Give me a productivity overview." },
];

// A chat this recent is picked up again when the panel opens; an older one
// waits in the history, and the panel starts a new chat.
const RESUME_WITHIN_MS = 10 * 60_000;

// How many messages a chat shows at first, and loads each time after.
const MESSAGE_PAGE = 40;

export type Surface = "panel" | "tab" | "popup";

type UserMessage = Extract<ChatMessage, { role: "user" }>;

// LittleAI's mark beside its turns.
const Mark = ({ busy = false }: { busy?: boolean }) => (
	<motion.span
		aria-hidden
		className="ll-accent-fill mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
		animate={busy ? { scale: [1, 1.12, 1] } : undefined}
		transition={busy ? { duration: 1.4, repeat: Infinity } : undefined}
	>
		<SparkleIcon weight="fill" className="size-3.5" />
	</motion.span>
);

// What a run is doing, live: its finished steps, then the current one, or
// the answer as it streams in.
const Activity = ({ status }: { status: RunStatus }) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const draft = withoutThinking(status.draft ?? "");
	return (
		<div role="status" className="flex gap-x-3">
			<Mark busy />
			<div className="flex min-w-0 grow flex-col gap-y-2">
				<ol
					className={`flex flex-col gap-y-1 pt-0.5 text-sm ${dark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					{status.steps.map((step, index) => (
						<li
							key={`${step}-${index}`}
							className="flex items-center gap-x-2"
						>
							<CheckCircleIcon
								weight="fill"
								className="size-4 shrink-0"
							/>
							{step}
						</li>
					))}
					{draft === "" ? (
						<li
							className={`flex items-center gap-x-2 ${dark ? "text-neutral-200" : "text-neutral-800"}`}
						>
							<CircleNotchIcon className="size-4 shrink-0 animate-spin" />
							<motion.span
								animate={{ opacity: [0.55, 1, 0.55] }}
								transition={{ duration: 1.6, repeat: Infinity }}
							>
								{status.stage}
							</motion.span>
						</li>
					) : null}
				</ol>
				{draft !== "" ? (
					<div
						className={`ll-streaming text-[15px] leading-relaxed wrap-break-word ${dark ? "text-neutral-100" : "text-neutral-900"}`}
					>
						<Markdown text={draft} />
					</div>
				) : null}
			</div>
		</div>
	);
};

// A page as a small chip: its icon and title. Only favicons allowed by
// extension CSP (`data:`, `blob:`, same-origin) render as <img>; external
// https:// favicons use BrowserIcon so CSP is never violated.
const PageChip = ({
	title,
	favicon,
	tone,
}: {
	title: string;
	favicon?: string;
	tone: "muted" | "attached";
}) => {
	const safeFavicon =
		favicon && isInlineImageAllowed(favicon) ? favicon : undefined;
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	const showImg = safeFavicon !== undefined && failedUrl !== safeFavicon;
	return (
		<>
			{showImg ? (
				<img
					src={safeFavicon}
					alt=""
					onError={() => setFailedUrl(safeFavicon)}
					className="size-3.5 shrink-0 rounded-sm"
					draggable={false}
				/>
			) : (
				<BrowserIcon
					aria-hidden
					className={`size-3.5 shrink-0 ${tone === "muted" ? "" : "text-[var(--ll-accent)]"}`}
				/>
			)}
			<span className="min-w-0 truncate">{title}</span>
		</>
	);
};

const PROVIDER_LABELS: Record<LAI_PROVIDERS, string> = {
	[LAI_PROVIDERS.OLLAMA]: "Ollama",
	[LAI_PROVIDERS.LM_STUDIO]: "LM Studio",
	[LAI_PROVIDERS.CUSTOM]: "Custom",
};

// In-chat model switcher: lets users swap models on the current provider
// without leaving the conversation, with a link to AI settings for provider
// or credential changes.
const ModelPicker = ({
	disabled,
	onOpenSettings,
}: {
	disabled: boolean;
	onOpenSettings: () => void;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const settings = useCurrentUserSettings();
	const ai = settings?.ai;
	const configured = isAISettingsConfigured(ai);
	const model = ai?.model.trim() ?? "";
	const [open, setOpen] = useState(false);
	const [modelQuery, setModelQuery] = useState("");
	const [models, setModels] = useState<Array<string>>([]);
	const [loading, setLoading] = useState(false);
	const [fetchedFor, setFetchedFor] = useState<string>("");
	const containerRef = useRef<HTMLDivElement>(null);

	const providerKey = ai ? `${ai.provider}|${ai.baseUrl}|${ai.apiKey}` : "";

	const loadModels = useCallback(async () => {
		if (!ai) return;
		setLoading(true);
		try {
			const fetched = await fetchProviderModels(ai);
			setModels(fetched);
			setFetchedFor(providerKey);
		} finally {
			setLoading(false);
		}
	}, [ai, providerKey]);

	const closePicker = () => {
		setOpen(false);
		setModelQuery("");
	};

	const toggleOpen = () => {
		const nextOpen = !open;
		setOpen(nextOpen);
		if (!nextOpen) {
			setModelQuery("");
		} else if (ai && fetchedFor !== providerKey) {
			void loadModels();
		}
	};

	useEffect(() => {
		if (!open) return;
		const onMouseDown = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setOpen(false);
				setModelQuery("");
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				setOpen(false);
				setModelQuery("");
			}
		};
		document.addEventListener("mousedown", onMouseDown);
		document.addEventListener("keydown", onKeyDown, true);
		return () => {
			document.removeEventListener("mousedown", onMouseDown);
			document.removeEventListener("keydown", onKeyDown, true);
		};
	}, [open]);

	const muted = dark ? "text-neutral-400" : "text-neutral-500";

	if (!configured || !ai) {
		return (
			<button
				type="button"
				title="AI settings"
				onClick={onOpenSettings}
				className={`min-w-0 grow cursor-pointer truncate rounded-lg px-2 py-1 text-left text-xs font-medium transition-colors ${muted} ${dark ? "hover:text-white" : "hover:text-black"}`}
			>
				Set up AI
			</button>
		);
	}

	const choices =
		model !== "" && !models.includes(model) ? [model, ...models] : models;

	const presets = ai.presets ?? [];
	const normalizedQuery = modelQuery.trim().toLowerCase();
	const filteredChoices = normalizedQuery
		? choices.filter((candidate) =>
				candidate.toLowerCase().includes(normalizedQuery),
			)
		: choices;
	const filteredPresets = normalizedQuery
		? presets.filter(
				(preset) =>
					preset.name.toLowerCase().includes(normalizedQuery) ||
					preset.model.toLowerCase().includes(normalizedQuery) ||
					preset.provider.toLowerCase().includes(normalizedQuery),
			)
		: presets;

	const selectModel = async (nextModel: string) => {
		closePicker();
		if (nextModel === model) return;
		await attempt(() =>
			send("settings.update", {
				ai: { ...ai, model: nextModel },
			}),
		);
	};

	const selectPreset = async (
		preset: NonNullable<typeof ai.presets>[number],
	) => {
		closePicker();
		await attempt(() =>
			send("settings.update", {
				ai: {
					...ai,
					provider: preset.provider,
					baseUrl: preset.baseUrl,
					apiKey: preset.apiKey,
					model: preset.model,
				},
			}),
		);
	};

	return (
		<div ref={containerRef} className="relative min-w-0 grow">
			<button
				type="button"
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={`Model: ${model}, change`}
				title="Switch model"
				onClick={toggleOpen}
				className={`flex max-w-full cursor-pointer items-center gap-x-1.5 rounded-lg border px-2.5 py-1 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
					dark
						? "border-neutral-800 bg-black/50 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white"
						: "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-200/70 hover:text-black"
				}`}
			>
				<span className="min-w-0 truncate">{model}</span>
				<CaretUpDownIcon
					aria-hidden
					weight="regular"
					className="size-3.5 shrink-0 opacity-70"
				/>
			</button>
			<AnimatePresence>
				{open ? (
					<motion.div
						role="listbox"
						aria-label="Choose model"
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 6 }}
						transition={{ duration: 0.14 }}
						className={`absolute bottom-full left-0 z-30 mb-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border shadow-lg ${
							dark
								? "border-neutral-800 bg-neutral-900 text-neutral-100"
								: "border-neutral-200 bg-white text-neutral-900"
						}`}
					>
						<div
							className={`flex items-center justify-between border-b px-3 py-2 text-xs font-medium ${
								dark
									? "border-neutral-800 text-neutral-400"
									: "border-neutral-200 text-neutral-500"
							}`}
						>
							<span>{PROVIDER_LABELS[ai.provider]}</span>
							<button
								type="button"
								aria-label="Refresh models"
								disabled={loading}
								onClick={() => void loadModels()}
								className={`flex size-6 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
									dark
										? "hover:bg-neutral-800 hover:text-white"
										: "hover:bg-neutral-100 hover:text-black"
								}`}
							>
								<ArrowClockwiseIcon
									aria-hidden
									weight="regular"
									className={`size-3.5 ${loading ? "animate-spin" : ""}`}
								/>
							</button>
						</div>
						<div
							className={`border-b p-1.5 ${
								dark
									? "border-neutral-800"
									: "border-neutral-200"
							}`}
						>
							<label
								className={`ll-field flex h-8 items-center gap-x-1.5 rounded-lg border px-2 ${
									dark
										? "border-neutral-800 bg-black/60"
										: "border-neutral-200 bg-neutral-100"
								}`}
							>
								<MagnifyingGlassIcon
									aria-hidden
									weight="regular"
									className={`size-3.5 shrink-0 ${muted}`}
								/>
								<input
									type="search"
									autoFocus
									aria-label="Search models"
									placeholder="Search models"
									value={modelQuery}
									onChange={(event) =>
										setModelQuery(event.target.value)
									}
									className={`min-w-0 grow bg-transparent text-xs outline-none ${
										dark
											? "text-white placeholder:text-neutral-500"
											: "text-black placeholder:text-neutral-500"
									}`}
								/>
								{modelQuery !== "" ? (
									<button
										type="button"
										aria-label="Clear model search"
										onClick={() => setModelQuery("")}
										className={`flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full ${
											dark
												? "text-neutral-400 hover:text-white"
												: "text-neutral-500 hover:text-black"
										}`}
									>
										<XIcon
											weight="bold"
											className="size-2.5"
										/>
									</button>
								) : null}
							</label>
						</div>
						<div
							className={`flex max-h-48 flex-col gap-y-0.5 overflow-y-auto p-1 ${theme}-scrollbar`}
						>
							{loading && choices.length === 0 ? (
								<div className={`px-2.5 py-2 text-xs ${muted}`}>
									Loading models…
								</div>
							) : filteredChoices.length === 0 ? (
								<div className={`px-2.5 py-2 text-xs ${muted}`}>
									No matching models
								</div>
							) : (
								filteredChoices.map((candidate) => {
									const selected = candidate === model;
									return (
										<button
											key={candidate}
											type="button"
											role="option"
											aria-selected={selected}
											onClick={() =>
												void selectModel(candidate)
											}
											className={`flex w-full cursor-pointer items-center gap-x-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
												selected
													? "ll-accent-fill font-medium"
													: dark
														? "text-neutral-200 hover:bg-neutral-800"
														: "text-neutral-800 hover:bg-neutral-100"
											}`}
										>
											<span className="min-w-0 grow truncate">
												{candidate}
											</span>
											{isCloudModel(
												ai.provider,
												candidate,
											) ? (
												<span
													className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] leading-none ${
														selected
															? "border-current/30"
															: dark
																? "border-neutral-700 text-neutral-400"
																: "border-neutral-300 text-neutral-500"
													}`}
												>
													Cloud
												</span>
											) : null}
											{selected ? (
												<CheckIcon
													aria-hidden
													weight="bold"
													className="size-3.5 shrink-0"
												/>
											) : null}
										</button>
									);
								})
							)}
						</div>
						{filteredPresets.length > 0 ? (
							<div
								className={`flex flex-col gap-y-0.5 border-t p-1 ${
									dark
										? "border-neutral-800"
										: "border-neutral-200"
								}`}
							>
								<div
									className={`px-2.5 pt-1 pb-0.5 text-[11px] font-medium ${muted}`}
								>
									Saved connections
								</div>
								{filteredPresets.map((preset) => {
									const selected =
										ai.provider === preset.provider &&
										ai.baseUrl === preset.baseUrl &&
										ai.model === preset.model;
									return (
										<button
											key={preset.id}
											type="button"
											role="option"
											aria-selected={selected}
											onClick={() =>
												void selectPreset(preset)
											}
											className={`flex w-full cursor-pointer items-center gap-x-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
												selected
													? "ll-accent-fill font-medium"
													: dark
														? "text-neutral-200 hover:bg-neutral-800"
														: "text-neutral-800 hover:bg-neutral-100"
											}`}
										>
											<span className="min-w-0 grow truncate">
												{preset.name}
											</span>
											{selected ? (
												<CheckIcon
													aria-hidden
													weight="bold"
													className="size-3.5 shrink-0"
												/>
											) : null}
										</button>
									);
								})}
							</div>
						) : null}
						<div
							className={`border-t p-1 ${
								dark
									? "border-neutral-800"
									: "border-neutral-200"
							}`}
						>
							<button
								type="button"
								onClick={() => {
									setOpen(false);
									onOpenSettings();
								}}
								className={`flex w-full cursor-pointer items-center gap-x-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
									dark
										? "text-neutral-400 hover:bg-neutral-800 hover:text-white"
										: "text-neutral-600 hover:bg-neutral-100 hover:text-black"
								}`}
							>
								<GearSixIcon
									aria-hidden
									weight="regular"
									className="size-3.5 shrink-0"
								/>
								<span>AI settings…</span>
							</button>
						</div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
};

// What you send: the text box, the page you attach, and the model. Enter
// sends, Shift+Enter starts a new line, ↑ in an empty box edits your last
// message, and Esc stops LittleAI.
const Composer = ({
	text,
	setText,
	running,
	locked,
	placeholder,
	page,
	pageAttached,
	setPageAttached,
	onSend,
	onStop,
	onEditLast,
	onOpenSettings,
	inputRef,
}: {
	text: string;
	setText: (text: string) => void;
	running: boolean;
	// A change waits for approval: answering it comes first.
	locked: boolean;
	placeholder: string;
	page: WebTab | null;
	pageAttached: boolean;
	setPageAttached: (attached: boolean) => void;
	onSend: () => void;
	onStop: () => void;
	onEditLast: () => void;
	onOpenSettings: () => void;
	inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	return (
		<div
			className={`ll-field flex w-full flex-col rounded-2xl border shadow-sm transition-colors ${dark ? "border-neutral-800 bg-neutral-900" : "border-neutral-200 bg-neutral-100"}`}
		>
			{page ? (
				<div className="flex px-2 pt-2">
					{pageAttached ? (
						<span
							className={`flex max-w-full items-center gap-x-1.5 rounded-xl border py-1 pr-1 pl-2 text-xs ${dark ? "border-neutral-700 bg-black/50" : "border-neutral-300 bg-white"}`}
						>
							<PageChip
								title={page.title}
								favicon={page.favicon}
								tone="attached"
							/>
							<button
								type="button"
								aria-label={`Stop using ${page.title}`}
								title="Stop using this page"
								onClick={() => setPageAttached(false)}
								className={`flex size-5 shrink-0 cursor-pointer items-center justify-center rounded ${dark ? "hover:bg-neutral-800" : "hover:bg-neutral-200"}`}
							>
								<XIcon weight="bold" className="size-3" />
							</button>
						</span>
					) : (
						<button
							type="button"
							aria-label={`Use this page: ${page.title}`}
							title="LittleAI reads this page when you send"
							onClick={() => setPageAttached(true)}
							className={`flex max-w-full cursor-pointer items-center gap-x-1.5 rounded-lg border border-dashed px-2 py-1 text-xs transition-colors ${dark ? "border-neutral-700 text-neutral-400 hover:text-white" : "border-neutral-300 text-neutral-500 hover:text-black"}`}
						>
							<PlusIcon
								weight="bold"
								className="size-3 shrink-0"
							/>
							<PageChip
								title={page.title}
								favicon={page.favicon}
								tone="muted"
							/>
						</button>
					)}
				</div>
			) : null}
			<textarea
				ref={inputRef}
				data-testid="ai-assist-input"
				aria-label="Ask LittleAI"
				placeholder={placeholder}
				rows={1}
				disabled={locked}
				value={text}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					// An IME's Enter picks a word; it doesn't send.
					if (event.nativeEvent.isComposing) return;
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						onSend();
					}
					if (event.key === "ArrowUp" && text === "") {
						event.preventDefault();
						onEditLast();
					}
				}}
				className={`[field-sizing:content] max-h-48 min-h-11 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[15px] disabled:cursor-not-allowed ${theme}-scrollbar ${dark ? "text-white placeholder:text-neutral-400" : "text-black placeholder:text-neutral-500"}`}
			/>
			<div className="flex items-center gap-x-2 px-2 pb-2">
				<ModelPicker
					disabled={running}
					onOpenSettings={onOpenSettings}
				/>
				{running ? (
					<button
						type="button"
						aria-label="Stop"
						title="Stop (Esc)"
						className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${dark ? "bg-neutral-800 text-white hover:bg-neutral-700" : "bg-neutral-200 text-black hover:bg-neutral-300"}`}
						onClick={onStop}
					>
						<StopIcon weight="fill" className="size-3.5" />
					</button>
				) : (
					<button
						type="button"
						aria-label="Send message"
						title="Send (Enter)"
						disabled={text.trim() === "" || locked}
						className="ll-accent-fill flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
						onClick={onSend}
					>
						<ArrowUpIcon weight="bold" className="size-4" />
					</button>
				)}
			</div>
		</div>
	);
};

// What you said: the page it used, your words, and, beside your last
// message, Edit.
const Said = ({
	message,
	canEdit,
	onEdit,
}: {
	message: UserMessage;
	canEdit: boolean;
	onEdit: () => void;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	return (
		<div className="group flex flex-col items-end gap-y-1">
			{message.page ? (
				isReadablePage(message.page.url) ? (
					<a
						href={message.page.url}
						target="_blank"
						rel="noopener noreferrer"
						className={`flex max-w-[85%] items-center gap-x-1.5 truncate rounded-lg px-2 py-0.5 text-xs ${dark ? "text-neutral-400 hover:text-white" : "text-neutral-500 hover:text-black"}`}
					>
						<BrowserIcon
							aria-hidden
							className="size-3.5 shrink-0"
						/>
						<span className="truncate">{message.page.title}</span>
					</a>
				) : (
					<span
						className={`flex max-w-[85%] items-center gap-x-1.5 truncate rounded-lg px-2 py-0.5 text-xs ${dark ? "text-neutral-400" : "text-neutral-500"}`}
					>
						<BrowserIcon
							aria-hidden
							className="size-3.5 shrink-0"
						/>
						<span className="truncate">{message.page.title}</span>
					</span>
				)
			) : null}
			<div className="flex w-full items-center justify-end gap-x-1">
				{/* Beside the bubble, so it takes no room until it shows. */}
				{canEdit ? (
					<div className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
						<IconButton
							size="sm"
							label="Edit message"
							icon={PencilSimpleIcon}
							onClick={onEdit}
						/>
					</div>
				) : null}
				<p
					className={`max-w-[85%] rounded-2xl rounded-br-md border px-3.5 py-2 text-[15px] leading-relaxed wrap-break-word whitespace-pre-wrap ${dark ? "border-neutral-800 bg-neutral-900" : "border-neutral-200 bg-neutral-100"}`}
				>
					{message.text}
				</p>
			</div>
		</div>
	);
};

// LittleAI (decision 0017): a conversation with the profile's chats one tap
// away. The run answering a message belongs to the worker; this screen
// shows the stored chat, what the run is doing, and what it waits on.
const ChatScreen = ({
	keys,
	onBack,
	onOpenSettings = openAISettings,
}: {
	keys: ProfileKeys;
	surface?: Surface;
	onBack?: () => void;
	onOpenSettings?: () => void;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const profile = useCurrentUserProfile();
	const chats = useChats(keys);
	// The chat the user chose (null: a new one), or, until they choose, the
	// one a link names, or one from the last few minutes.
	const [chosen, setChatId] = useState<string | null | undefined>(
		() => /chat=([\w-]+)/.exec(location.hash)?.[1],
	);
	const [openedAt] = useState(() => Date.now());
	// Messages already in a chat when it opens are there at once; only what
	// arrives after slides in.
	const [shownSince, setShownSince] = useState(openedAt);
	// A long chat shows its latest messages; earlier ones come a page at a
	// time, from Show earlier or scrolling to the top.
	const [shownCount, setShownCount] = useState(MESSAGE_PAGE);
	// Where the reader was, from the bottom, while earlier messages load
	// above: the view stays put.
	const keepFromBottom = useRef<{
		chatId: string | null;
		offset: number;
		targetCount: number;
	} | null>(null);
	const sendingRef = useRef(false);
	const [atBottom, setAtBottom] = useState(true);
	const [editing, setEditing] = useState<UserMessage | null>(null);
	const [text, setText] = useState("");
	const openChat = (id: string | null) => {
		setChatId(id);
		setShownSince(Date.now());
		setShownCount(MESSAGE_PAGE);
		setAtBottom(true);
		keepFromBottom.current = null;
		setEditing(null);
		setText("");
	};
	const recent = chats?.[0];
	const chatId =
		chosen !== undefined
			? chosen
			: recent && openedAt - recent.updatedAt < RESUME_WITHIN_MS
				? recent.id
				: null;
	const loaded = useChatMessages(keys, chatId, shownCount);
	const messages = loaded?.messages;
	const hasEarlier = loaded?.hasEarlier ?? false;
	const showEarlier = () => {
		const element = scroller.current;
		if (!hasEarlier || keepFromBottom.current !== null) return;
		const nextCount = shownCount + MESSAGE_PAGE;
		keepFromBottom.current = element
			? {
					chatId,
					offset: element.scrollHeight - element.scrollTop,
					targetCount: nextCount,
				}
			: null;
		setShownCount(nextCount);
	};
	const status = useRunStatus(chatId);
	const page = useActiveWebTab();
	// The page the user tapped to attach (decision 0017): that tab at that
	// address, for the next message only. Leaving it, for another tab or
	// another address, takes it off.
	const [attachedPage, setAttachedPage] = useState<WebTab | null>(null);
	const pageAttached =
		attachedPage !== null &&
		page !== null &&
		attachedPage.tabId === page.tabId &&
		attachedPage.url === page.url;
	const setPageAttached = (on: boolean) => setAttachedPage(on ? page : null);
	const [showHistory, setShowHistory] = useState(false);
	const chatsButton = useRef<HTMLButtonElement>(null);
	// The list closes back to the button that opened it.
	const closeHistory = () => {
		// The button can take focus once the screen is no longer inert.
		flushSync(() => setShowHistory(false));
		chatsButton.current?.focus();
	};
	// A question the user waved away stays away, for that answer.
	const [dismissed, setDismissed] = useState<string | null>(null);
	const [ideas] = useState(() =>
		[...IDEAS].sort(() => Math.random() - 0.5).slice(0, 4),
	);
	const input = useRef<HTMLTextAreaElement>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const scrollToEnd = () =>
		scroller.current?.scrollTo({
			top: scroller.current.scrollHeight,
			behavior: "smooth",
		});
	useEffect(() => {
		if (atBottom) {
			scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
		}
		// Following new content only while the user is at the end.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		chatId,
		messages?.length,
		status?.stage,
		status?.steps.length,
		status?.draft,
	]);

	useLayoutEffect(() => {
		const element = scroller.current;
		const pending = keepFromBottom.current;
		if (!element || !pending) return;
		if (pending.chatId !== chatId) {
			keepFromBottom.current = null;
			return;
		}
		if (messages !== undefined) {
			element.scrollTo({
				top: element.scrollHeight - pending.offset,
			});
			keepFromBottom.current = null;
		}
	}, [chatId, messages]);

	const title = chats?.find((chat) => chat.id === chatId)?.title;
	const running = status !== null;
	const started = (messages?.length ?? 0) > 0 || running;
	const lastIndex = (messages?.length ?? 0) - 1;
	const last = messages?.[lastIndex];
	const lastSaid = [...(messages ?? [])]
		.reverse()
		.find((message): message is UserMessage => message.role === "user");
	const waiting: StoredAIOutput | null =
		!running && last?.role === "assistant" ? last.output : null;
	const approval = waiting?.confirmation;
	const question =
		waiting?.question && last && dismissed !== last.id
			? waiting.question
			: undefined;

	// The tab a page reference points at, if it is still open. Queries all
	// tabs and compares exact URLs because chrome.tabs.query({ url }) treats
	// the string as a match pattern (rejecting #fragments and matching *).
	const tabFor = async (url: string): Promise<PageRef | null> => {
		if (typeof chrome === "undefined" || !chrome.tabs?.query) return null;
		try {
			const tabs = await chrome.tabs.query({});
			const tab = tabs.find((candidate) => candidate.url === url);
			return tab?.id !== undefined
				? { tabId: tab.id, title: tab.title ?? url, url }
				: null;
		} catch {
			return null;
		}
	};

	// Sends `words` (or the box's text), after removing the message being
	// edited and everything after it.
	const sendNow = async (
		words: string = text,
		options: { replace?: UserMessage | null; page?: PageRef | null } = {},
	): Promise<boolean> => {
		const trimmed = words.trim();
		if (trimmed === "" || running || approval || sendingRef.current) {
			return false;
		}
		const replace = options.replace ?? editing;
		const attached =
			options.page !== undefined
				? options.page
				: pageAttached
					? {
							tabId: attachedPage.tabId,
							title: attachedPage.title,
							url: attachedPage.url,
						}
					: null;
		sendingRef.current = true;
		try {
			const sent = await attempt(async () => {
				const result = await send("ai.send", {
					chatId,
					text: trimmed,
					...(replace && chatId ? { replaceFromId: replace.id } : {}),
					...(attached ? { page: attached } : {}),
				});
				setChatId(result.chatId);
			});
			if (sent) {
				setText("");
				setEditing(null);
				setAttachedPage(null);
				setAtBottom(true);
			}
			return sent;
		} finally {
			sendingRef.current = false;
		}
	};
	const stop = () => {
		if (chatId) void attempt(() => send("ai.stop", { chatId }));
	};
	const edit = (message: UserMessage) => {
		setEditing(message);
		setText(message.text);
		input.current?.focus();
	};
	// Another answer to the last question: the answer goes, and the
	// question is asked again, with its page if that tab is still open.
	const regenerate = async () => {
		if (!lastSaid) return;
		await sendNow(lastSaid.text, {
			replace: lastSaid,
			page: lastSaid.page ? await tabFor(lastSaid.page.url) : null,
		});
	};

	// Esc closes the chats list; otherwise it stops LittleAI, or stops
	// editing.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (showHistory) {
				flushSync(() => setShowHistory(false));
				chatsButton.current?.focus();
			} else if (running && chatId) {
				void attempt(() => send("ai.stop", { chatId }));
			} else if (editing) {
				setEditing(null);
				setText("");
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [running, chatId, editing, showHistory]);

	const composer = (
		<Composer
			text={text}
			setText={setText}
			running={running}
			locked={Boolean(approval)}
			placeholder={
				approval
					? "Approve or cancel the change first"
					: question
						? "Or type your own answer"
						: started
							? "Reply to LittleAI"
							: "Ask about your saves, tasks, notes, images or this page"
			}
			page={page}
			pageAttached={pageAttached}
			setPageAttached={setPageAttached}
			onSend={() => void sendNow()}
			onStop={stop}
			onEditLast={() => {
				if (lastSaid && !running) edit(lastSaid);
			}}
			onOpenSettings={onOpenSettings}
			inputRef={input}
		/>
	);
	const greetingName = profile?.name.split(" ")[0];

	const historyOpen = Boolean(showHistory && chats);

	return (
		<div
			className={`relative flex h-full w-full flex-col overflow-hidden ${dark ? "bg-black text-white" : "bg-white text-black"}`}
		>
			<header
				// While the chats list is open, nothing behind it can be
				// reached: not by Tab, not by a screen reader.
				inert={historyOpen}
				className={`flex h-14 shrink-0 items-center gap-x-1 border-b px-2 ${dark ? "border-neutral-800 bg-black" : "border-neutral-200 bg-white"}`}
			>
				{onBack ? (
					<IconButton
						label="Go back"
						icon={ArrowLeftIcon}
						onClick={onBack}
					/>
				) : null}
				<IconButton
					label="Chats"
					icon={ListIcon}
					buttonRef={chatsButton}
					onClick={() => setShowHistory(true)}
				/>
				{!onBack ? (
					<LUILogo className="ml-0.5 size-7 shrink-0" />
				) : null}
				<h1 className="min-w-0 grow truncate px-1 text-base font-semibold">
					{title ?? "LittleAI"}
				</h1>
				<IconButton
					label="New chat"
					icon={NotePencilIcon}
					onClick={() => {
						openChat(null);
						setEditing(null);
						setText("");
						input.current?.focus();
					}}
				/>
			</header>
			<div
				inert={historyOpen}
				className="mx-auto flex min-h-0 w-full max-w-3xl grow flex-col"
			>
				{started ? (
					<>
						<div
							ref={scroller}
							role="log"
							aria-label="Conversation"
							onScroll={(event) => {
								const element = event.currentTarget;
								if (element.scrollTop < 80) showEarlier();
								setAtBottom(
									element.scrollHeight -
										element.scrollTop -
										element.clientHeight <
										48,
								);
							}}
							className={`flex min-h-0 grow flex-col gap-y-5 overflow-x-hidden overflow-y-auto px-4 pt-4 pb-6 ${theme}-scrollbar`}
						>
							{hasEarlier ? (
								<div className="flex justify-center">
									<TextAction
										label="Show earlier messages"
										icon={ArrowUpIcon}
										onClick={showEarlier}
									/>
								</div>
							) : null}
							{messages?.map((message, index) => (
								<motion.div
									key={message.id}
									initial={
										message.createdAt > shownSince
											? { opacity: 0, y: 6 }
											: false
									}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.18 }}
								>
									{message.role === "user" ? (
										<Said
											message={message}
											canEdit={
												!running &&
												!approval &&
												message.id === lastSaid?.id
											}
											onEdit={() => edit(message)}
										/>
									) : (
										<Answer
											chatId={message.chatId}
											output={message.output}
											isLatest={index === lastIndex}
											idle={!running}
											docked={
												index === lastIndex &&
												Boolean(approval || question)
											}
											onRegenerate={
												index === lastIndex && lastSaid
													? () => void regenerate()
													: null
											}
											onOpenSettings={onOpenSettings}
										/>
									)}
								</motion.div>
							))}
							{status ? <Activity status={status} /> : null}
						</div>
						<div className="relative shrink-0 px-3 pb-3">
							<AnimatePresence>
								{!atBottom ? (
									<motion.button
										type="button"
										aria-label="Jump to latest"
										initial={{ opacity: 0, y: 6 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: 6 }}
										onClick={scrollToEnd}
										className={`absolute -top-11 left-1/2 flex size-8 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border shadow-sm transition-colors ${dark ? "border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100"}`}
									>
										<ArrowDownIcon
											weight="bold"
											className="size-4"
										/>
									</motion.button>
								) : null}
							</AnimatePresence>
							<div className="flex flex-col gap-y-2">
								<AnimatePresence>
									{approval && chatId ? (
										<ApprovalBox
											key="approval"
											confirmation={approval}
											active={!showHistory}
											onConfirm={(password) =>
												void attempt(() =>
													send("ai.confirm", {
														chatId,
														password,
													}),
												)
											}
											onCancel={() =>
												void attempt(() =>
													send("ai.cancel", {
														chatId,
													}),
												)
											}
										/>
									) : question && last ? (
										<QuestionBox
											key={`question-${last.id}`}
											question={question}
											active={!showHistory}
											onAnswer={(answer) =>
												void sendNow(answer)
											}
											onSomethingElse={() =>
												input.current?.focus()
											}
											onDismiss={() =>
												setDismissed(last.id)
											}
										/>
									) : null}
								</AnimatePresence>
								{editing ? (
									<div
										className={`flex items-center justify-between px-2 text-xs ${dark ? "text-neutral-400" : "text-neutral-500"}`}
									>
										<span className="flex items-center gap-x-1.5">
											<PencilSimpleIcon
												aria-hidden
												className="size-3.5"
											/>
											Editing your message: sending
											replaces it and what followed.
										</span>
										<button
											type="button"
											className={`cursor-pointer rounded-lg px-2 py-0.5 font-medium transition-colors ${dark ? "hover:bg-neutral-800 hover:text-white" : "hover:bg-neutral-200 hover:text-black"}`}
											onClick={() => {
												setEditing(null);
												setText("");
											}}
										>
											Cancel
										</button>
									</div>
								) : null}
								{composer}
							</div>
						</div>
					</>
				) : (
					// A new chat: a greeting, the box in the middle, ideas.
					<div
						className={`flex grow flex-col justify-center gap-y-5 overflow-y-auto px-4 pb-8 ${theme}-scrollbar`}
					>
						<div className="flex flex-col items-center gap-y-3 text-center">
							<div className="relative flex items-center justify-center">
								<LUILogo className="size-12" />
								<span
									aria-hidden
									className="ll-accent-fill absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full"
								>
									<SparkleIcon
										weight="fill"
										className="size-3"
									/>
								</span>
							</div>
							<h2 className="text-2xl font-semibold tracking-tight">
								{greetingName
									? `What can I help with, ${greetingName}?`
									: "What can I help with?"}
							</h2>
						</div>
						{composer}
						<div className="grid grid-cols-1 gap-2.5 min-[320px]:grid-cols-2">
							{(page
								? [
										{
											icon: BrowserIcon,
											text: "Summarize this page.",
											withPage: true,
										},
										...ideas.slice(0, 3),
									]
								: ideas
							).map((idea) => (
								<button
									key={idea.text}
									type="button"
									className={`flex cursor-pointer flex-col items-start gap-y-2 rounded-2xl border p-3.5 text-left text-sm transition-all active:scale-[0.99] ${dark ? "border-neutral-800 bg-neutral-900 text-neutral-200 hover:bg-neutral-800" : "border-neutral-200 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"}`}
									onClick={() => {
										const withPage =
											"withPage" in idea &&
											idea.withPage &&
											page;
										if (withPage) setPageAttached(true);
										void sendNow(idea.text, {
											page: withPage
												? {
														tabId: page.tabId,
														title: page.title,
														url: page.url,
													}
												: undefined,
										});
									}}
								>
									<idea.icon
										aria-hidden
										className={`size-4 ${dark ? "text-neutral-400" : "text-neutral-500"}`}
									/>
									{idea.text}
								</button>
							))}
						</div>
					</div>
				)}
			</div>
			<AnimatePresence>
				{showHistory && chats ? (
					<History
						key="history"
						chats={chats}
						currentId={chatId}
						onOpen={(id) => {
							openChat(id);
							setEditing(null);
							closeHistory();
						}}
						onClose={closeHistory}
						onDeleted={(id) => {
							if (id === chatId) openChat(null);
						}}
					/>
				) : null}
			</AnimatePresence>
		</div>
	);
};

export { ChatScreen };
