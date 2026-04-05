import { LAIOutput } from "little-shared/types";
import { LFACEEXPRESSION_TO_ICON } from "../../../constants";
import { LTHEME, LFACE_EXPRESSION } from "little-shared/enums";
import {
	ArrowClockwiseIcon,
	ArrowCounterClockwiseIcon,
	ArrowDownIcon,
	ArrowUpIcon,
	BroomIcon,
	CopyIcon,
	CircleIcon,
	DownloadSimpleIcon,
	LinkSimpleIcon,
	SparkleIcon,
} from "@phosphor-icons/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { fakeWait } from "little-shared/utils/misc";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { LittleAI } from "../../../services/ai";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { useTheme } from "../../hooks/useTheme";

type ChatCell =
	| {
			id: string;
			role: "user";
			message: string;
	  }
	| {
			id: string;
			role: "ai";
			aiOutput: LAIOutput;
	  };

type ParsedImage = {
	alt: string;
	src: string;
};

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

const createCellId = (): string => {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const sanitizeImageUrl = (rawUrl: string): string => {
	const trimmed = rawUrl.trim();
	if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
};

const isSupportedImageUrl = (url: string): boolean => {
	return (
		url.startsWith("http://") ||
		url.startsWith("https://") ||
		url.startsWith("blob:") ||
		url.startsWith("data:image/") ||
		url.startsWith("chrome-extension://")
	);
};

const extractMarkdownImages = (
	message: string,
): { markdown: string; images: Array<ParsedImage> } => {
	const images: Array<ParsedImage> = [];
	const markdown = message.replace(
		MARKDOWN_IMAGE_REGEX,
		(_match, alt, src) => {
			const imageUrl = sanitizeImageUrl(String(src ?? ""));
			if (isSupportedImageUrl(imageUrl)) {
				images.push({
					alt: String(alt ?? "").trim() || "AI image",
					src: imageUrl,
				});
				return "";
			}
			return _match;
		},
	);

	return {
		markdown: markdown.replace(/\n{3,}/g, "\n\n").trim(),
		images,
	};
};

const QUICK_PROMPT_POOL = [
	"Show my recent history.",
	"Give me a productivity overview.",
	"Find my pending high priority tasks.",
	"What reminders are due today?",
	"Show my latest saved bookmarks.",
	"Find notes about project ideas.",
	"List tasks with medium priority.",
	"Do I have overdue tasks?",
	"Show reminders for tomorrow.",
	"What did I browse recently about AI?",
	"Find saves from Hotstar.",
	"Summarize my pending tasks.",
];

const AI_PROGRESS_STAGES = [
	"Preparing",
	"Thinking",
	"Running tool",
	"Finalizing",
] as const;

type AIProgressStage = (typeof AI_PROGRESS_STAGES)[number];

const asProgressStage = (message: string): AIProgressStage | null => {
	const trimmed = message.trim();
	return AI_PROGRESS_STAGES.includes(trimmed as AIProgressStage)
		? (trimmed as AIProgressStage)
		: null;
};

const pickQuickPrompts = (count: number): Array<string> => {
	const pool = [...QUICK_PROMPT_POOL];
	for (let i = pool.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[pool[i], pool[j]] = [pool[j], pool[i]];
	}
	return pool.slice(0, Math.max(1, Math.min(count, pool.length)));
};

const IntialInterface = ({ className }: { className?: string }) => {
	const { theme } = useTheme();
	return (
		<motion.div
			className={twMerge(`flex h-full w-full flex-col`, className)}
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, delay: 0.3 }}
			exit={{ opacity: 0, y: 10 }}
		>
			<div
				className={`flex w-full grow flex-col items-center justify-center px-10`}
			>
				<div className={`h-max w-max p-5 opacity-75`}>
					<LUIThemedIcon
						Icon={SparkleIcon}
						color={theme === LTHEME.DARK ? "white" : "black"}
						weight="fill"
						className={`size-16`}
					/>
				</div>
				<div
					className={`text-5xl ${theme === LTHEME.DARK ? "text-white" : "text-black"} `}
				>
					<span className={`font-bold opacity-50`}>{"Hi, I'm "}</span>
					<span className={`font-black opacity-75`}>LittleAI</span>
				</div>
				<div
					className={`text-3xl font-bold italic ${theme === LTHEME.DARK ? "text-white" : "text-black"} text-center opacity-25`}
				>
					How can I help you?
				</div>
			</div>
		</motion.div>
	);
};

const UserCellBase = ({
	className,
	message,
}: {
	className?: string;
	message: string;
}) => {
	const { theme } = useTheme();
	return (
		<div className={twMerge(`max-h flex w-full justify-end`, className)}>
			<div
				className={`h-max w-max max-w-4/5 ${
					theme === LTHEME.DARK
						? "bg-neutral-800 text-white"
						: "bg-neutral-100 text-black"
				} rounded-l-3xl rounded-tr-3xl px-5 py-2 wrap-break-word`}
			>
				{message}
			</div>
		</div>
	);
};
const UserCell = memo(UserCellBase);

const AIImageAttachmentBase = ({ src, alt }: { src: string; alt: string }) => {
	const { theme } = useTheme();
	const [contextMenuPos, setContextMenuPos] = useState<{
		x: number;
		y: number;
	} | null>(null);

	useEffect(() => {
		if (!contextMenuPos) {
			return;
		}
		const closeMenu = () => setContextMenuPos(null);
		window.addEventListener("click", closeMenu);
		window.addEventListener("scroll", closeMenu, true);
		return () => {
			window.removeEventListener("click", closeMenu);
			window.removeEventListener("scroll", closeMenu, true);
		};
	}, [contextMenuPos]);

	const toPortableUrl = async (): Promise<string> => {
		if (!src.startsWith("blob:")) {
			return src;
		}
		try {
			const response = await fetch(src);
			if (!response.ok) {
				return src;
			}
			const blob = await response.blob();
			return await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => {
					if (typeof reader.result === "string") {
						resolve(reader.result);
						return;
					}
					reject(new Error("Could not convert image URL."));
				};
				reader.onerror = () =>
					reject(new Error("Could not convert image URL."));
				reader.readAsDataURL(blob);
			});
		} catch {
			return src;
		}
	};

	const openImage = async () => {
		const portableUrl = await toPortableUrl();
		window.open(portableUrl, "_blank", "noopener,noreferrer");
	};

	const downloadImage = async () => {
		const portableUrl = await toPortableUrl();
		const link = document.createElement("a");
		link.href = portableUrl;
		link.download = `${alt.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "ai-image"}.png`;
		link.click();
	};

	const copyImageUrl = async () => {
		try {
			await navigator.clipboard.writeText(src);
		} catch {
			// Ignore clipboard failures in constrained contexts.
		}
	};

	return (
		<div className="relative mt-2 flex w-full max-w-full flex-col gap-y-1">
			<img
				src={src}
				alt={alt}
				className={`max-h-72 w-auto max-w-full rounded-lg border select-auto ${
					theme === LTHEME.DARK
						? "border-neutral-700"
						: "border-neutral-300"
				}`}
				draggable={false}
				onContextMenu={(event) => {
					event.preventDefault();
					setContextMenuPos({
						x: event.clientX,
						y: event.clientY,
					});
				}}
			/>
			<div className="flex h-max w-full gap-x-2">
				<button
					type="button"
					onClick={() => {
						void openImage();
					}}
					className={`flex h-7 items-center gap-x-1 rounded-md px-2 text-xs ${
						theme === LTHEME.DARK
							? "bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
							: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
					}`}
				>
					<LUIThemedIcon
						Icon={LinkSimpleIcon}
						weight="bold"
						className="size-3"
					/>
					<span>Open</span>
				</button>
				<button
					type="button"
					onClick={() => {
						void downloadImage();
					}}
					className={`flex h-7 items-center gap-x-1 rounded-md px-2 text-xs ${
						theme === LTHEME.DARK
							? "bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
							: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
					}`}
				>
					<LUIThemedIcon
						Icon={DownloadSimpleIcon}
						weight="bold"
						className="size-3"
					/>
					<span>Download</span>
				</button>
			</div>
			{contextMenuPos ? (
				<div
					className={`fixed z-50 min-w-40 rounded-lg border p-1 text-sm shadow-lg ${
						theme === LTHEME.DARK
							? "border-neutral-700 bg-neutral-950 text-white"
							: "border-neutral-300 bg-white text-black"
					}`}
					style={{
						left: Math.max(
							8,
							Math.min(contextMenuPos.x, window.innerWidth - 180),
						),
						top: Math.max(
							8,
							Math.min(
								contextMenuPos.y,
								window.innerHeight - 120,
							),
						),
					}}
				>
					<button
						type="button"
						className={`flex w-full rounded-md px-2 py-1 text-left ${
							theme === LTHEME.DARK
								? "hover:bg-neutral-800"
								: "hover:bg-neutral-100"
						}`}
						onClick={() => {
							void openImage();
							setContextMenuPos(null);
						}}
					>
						Open in new tab
					</button>
					<button
						type="button"
						className={`flex w-full rounded-md px-2 py-1 text-left ${
							theme === LTHEME.DARK
								? "hover:bg-neutral-800"
								: "hover:bg-neutral-100"
						}`}
						onClick={() => {
							void downloadImage();
							setContextMenuPos(null);
						}}
					>
						Download image
					</button>
					<button
						type="button"
						className={`flex w-full rounded-md px-2 py-1 text-left ${
							theme === LTHEME.DARK
								? "hover:bg-neutral-800"
								: "hover:bg-neutral-100"
						}`}
						onClick={() => {
							void copyImageUrl();
							setContextMenuPos(null);
						}}
					>
						Copy image link
					</button>
				</div>
			) : null}
		</div>
	);
};

const AIImageAttachment = memo(AIImageAttachmentBase, (prev, next) => {
	return prev.src === next.src && prev.alt === next.alt;
});

const AICellBase = ({
	className,
	aiOutput,
	isLatest = false,
	showRetry = false,
	onRetry,
}: {
	className?: string;
	aiOutput: LAIOutput;
	isLatest?: boolean;
	showRetry?: boolean;
	onRetry?: () => void;
}) => {
	const { theme } = useTheme();
	const [copied, setCopied] = useState(false);
	const cleanedMessage = aiOutput.message
		? aiOutput.message.replace(/<think>.*?<\/think>/gs, "").trim()
		: "";
	const progressStage =
		aiOutput.expression === LFACE_EXPRESSION.THINKING
			? asProgressStage(cleanedMessage)
			: null;
	const shouldRenderInlineProgress = progressStage !== null;
	const parsedMessage = useMemo(
		() => extractMarkdownImages(cleanedMessage),
		[cleanedMessage],
	);
	const canShowCopy =
		isLatest &&
		aiOutput.expression !== LFACE_EXPRESSION.THINKING &&
		cleanedMessage !== "";
	const canShowRetry =
		showRetry &&
		isLatest &&
		aiOutput.expression !== LFACE_EXPRESSION.THINKING &&
		cleanedMessage !== "";

	const handleCopy = async () => {
		if (!cleanedMessage) return;
		try {
			await navigator.clipboard.writeText(cleanedMessage);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1000);
		} catch {
			// Ignore clipboard failures in constrained contexts.
		}
	};

	return (
		<div className={twMerge(`flex h-max w-full gap-x-1`, className)}>
			<div className={`h-max w-max shrink-0 px-2`}>
				{isLatest ? (
					<div
						className={`flex h-8 w-8 items-center justify-center rounded-full`}
					>
						<LUIThemedIcon
							Icon={LFACEEXPRESSION_TO_ICON[aiOutput.expression]}
							color={theme === LTHEME.DARK ? "white" : "black"}
							className={`size-5`}
						/>
					</div>
				) : (
					<div
						className={`flex h-8 w-8 items-center justify-center rounded-full`}
					>
						<LUIThemedIcon
							Icon={SparkleIcon}
							color={theme === LTHEME.DARK ? "white" : "black"}
							weight="fill"
							className={`size-5`}
						/>
					</div>
				)}
			</div>
			<div className={`flex h-max grow flex-col`}>
				{aiOutput.expression === LFACE_EXPRESSION.THINKING ? (
					<div
						className={`flex h-max w-full items-center gap-x-2 py-1`}
					>
						<div className="flex h-max w-max">
							<AnimatePresence>
								{[0.1, 0.3, 0.5].map((delay, index) => (
									<motion.div
										key={index}
										className={`h-max w-max ${theme === LTHEME.DARK ? "text-white" : "text-black"} py-1`}
										initial={{ opacity: 0, y: 0 }}
										animate={{ opacity: 1, y: [-5, 5, -5] }}
										transition={{
											duration: 0.6,
											repeat: Infinity,
											repeatType: "reverse",
											delay,
										}}
										exit={{ opacity: 0 }}
									>
										<LUIThemedIcon
											Icon={CircleIcon}
											color={
												theme === LTHEME.DARK
													? "white"
													: "black"
											}
											weight="fill"
											className="size-2"
										/>
									</motion.div>
								))}
							</AnimatePresence>
						</div>
						{shouldRenderInlineProgress ? (
							<motion.span
								className={`text-xs font-medium ${
									theme === LTHEME.DARK
										? "text-neutral-200"
										: "text-neutral-700"
								}`}
								animate={{ opacity: [0.35, 1, 0.35] }}
								transition={{
									duration: 1.1,
									repeat: Infinity,
									ease: "easeInOut",
								}}
							>
								{progressStage}
							</motion.span>
						) : null}
					</div>
				) : null}

				{aiOutput.message && !shouldRenderInlineProgress ? (
					<div
						className={`h-max max-w-4/5 ${theme === LTHEME.DARK ? "text-white" : "text-black"} py-1 wrap-break-word`}
					>
						{parsedMessage.markdown !== "" ? (
							<ReactMarkdown
								urlTransform={(url) => {
									if (
										typeof url === "string" &&
										(url.startsWith("data:image/") ||
											url.startsWith("blob:") ||
											url.startsWith(
												"chrome-extension://",
											))
									) {
										return url;
									}
									return defaultUrlTransform(url);
								}}
							>
								{parsedMessage.markdown}
							</ReactMarkdown>
						) : null}
						{parsedMessage.images.map((image, index) => (
							<AIImageAttachment
								key={`${image.src}-${index}`}
								src={image.src}
								alt={image.alt}
							/>
						))}
						{canShowCopy || canShowRetry ? (
							<div className="mt-2 flex w-full flex-wrap justify-start gap-2">
								{canShowCopy ? (
									<button
										className={`flex h-7 cursor-pointer items-center gap-x-1 rounded-md px-2 text-xs transition-all active:scale-95 ${
											theme === LTHEME.DARK
												? "bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
												: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
										}`}
										onClick={handleCopy}
										type="button"
									>
										<LUIThemedIcon
											Icon={CopyIcon}
											weight="bold"
											className="size-3"
										/>
										<span>
											{copied ? "Copied" : "Copy"}
										</span>
									</button>
								) : null}
								{canShowRetry ? (
									<button
										type="button"
										className={`flex h-7 cursor-pointer items-center gap-x-1 rounded-md px-2 text-xs transition-all active:scale-95 ${
											theme === LTHEME.DARK
												? "bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
												: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
										}`}
										onClick={onRetry}
									>
										<LUIThemedIcon
											Icon={ArrowClockwiseIcon}
											weight="bold"
											className="size-3"
										/>
										<span>Retry</span>
									</button>
								) : null}
							</div>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
};
const AICell = memo(AICellBase, (prev, next) => {
	return (
		prev.aiOutput === next.aiOutput &&
		prev.className === next.className &&
		prev.isLatest === next.isLatest &&
		prev.showRetry === next.showRetry &&
		prev.onRetry === next.onRetry
	);
});

const Component = ({ className }: { className?: string }) => {
	const { theme } = useTheme();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const chatContainerRef = useRef<HTMLDivElement>(null);
	const requestLockRef = useRef(false);

	const adjustHeight = () => {
		if (!textareaRef.current) return;
		const textarea = textareaRef.current;
		textarea.style.height = "48px";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
	};

	const [userInput, setUserInput] = useState<string>("");
	const [lastPrompt, setLastPrompt] = useState<string>("");
	const [quickPrompts, setQuickPrompts] = useState<Array<string>>(() =>
		pickQuickPrompts(3),
	);
	const [cells, setCells] = useState<Array<ChatCell>>([]);
	const [aiAssist, setAIAsist] = useState<LittleAI | undefined>();
	const [currentLAIOutput, setCurrentLAIOutput] = useState<LAIOutput | null>(
		null,
	);
	const [isAsking, setIsAsking] = useState(false);
	const [canUndo, setCanUndo] = useState(false);
	const [isScrolledUp, setIsScrolledUp] = useState(false);

	useEffect(() => {
		const container = chatContainerRef.current;
		if (!container) return;

		const handleScroll = () => {
			const isAtBottom =
				container.scrollTop + container.clientHeight >=
				container.scrollHeight - 10;
			setIsScrolledUp(!isAtBottom);
		};

		container.addEventListener("scroll", handleScroll);
		return () => {
			container.removeEventListener("scroll", handleScroll);
		};
	}, [chatContainerRef, cells]);

	useEffect(() => {
		adjustHeight();
	}, [userInput]);

	useEffect(() => {
		if (chatContainerRef.current && !isScrolledUp) {
			chatContainerRef.current.scrollTo({
				top: chatContainerRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [cells, currentLAIOutput, isScrolledUp]);

	useEffect(() => {
		if (!aiAssist) {
			LittleAI.getLAIAssistInstance().then((instance) => {
				setAIAsist(instance);
				setCanUndo(instance.hasUndoAction());
			});
		}
	}, []);

	const askAI = async (nextInput?: string) => {
		if (!aiAssist || isAsking || requestLockRef.current) return;
		const input = (nextInput ?? userInput).trim();
		if (input === "") return;
		requestLockRef.current = true;
		setIsAsking(true);

		if (currentLAIOutput) {
			setCells((prevCells) => [
				...prevCells,
				{
					id: createCellId(),
					role: "ai",
					aiOutput: currentLAIOutput,
				},
			]);
			setCurrentLAIOutput(null);
		}

		setUserInput("");
		setLastPrompt(input);
		setCells((prevCells) => [
			...prevCells,
			{
				id: createCellId(),
				role: "user",
				message: input,
			},
		]);
		setCurrentLAIOutput({
			message: "Preparing",
			actions: [],
			expression: LFACE_EXPRESSION.THINKING,
		});

		try {
			await fakeWait();
			const aiOutput = await aiAssist.prompt(input, {
				onProgress: (progress) => {
					setCurrentLAIOutput((previous) => ({
						message: progress.message,
						actions: previous?.actions ?? [],
						expression: LFACE_EXPRESSION.THINKING,
					}));
				},
			});
			setCurrentLAIOutput(aiOutput);
			setCanUndo(aiAssist.hasUndoAction());
		} finally {
			setIsAsking(false);
			requestLockRef.current = false;
		}
	};

	const clearChat = () => {
		if (!aiAssist || isAsking) return;
		setCells([]);
		setCurrentLAIOutput(null);
		setUserInput("");
		setLastPrompt("");
		setCanUndo(false);
		setQuickPrompts(pickQuickPrompts(3));
		aiAssist.clear();
	};

	const undoLastAction = async () => {
		if (!aiAssist || isAsking || !canUndo || requestLockRef.current) return;
		requestLockRef.current = true;
		setIsAsking(true);
		if (currentLAIOutput) {
			setCells((prevCells) => [
				...prevCells,
				{
					id: createCellId(),
					role: "ai",
					aiOutput: currentLAIOutput,
				},
			]);
		}
		setCurrentLAIOutput({
			message: "",
			actions: [],
			expression: LFACE_EXPRESSION.THINKING,
		});
		try {
			const output = await aiAssist.undoLastAction();
			setCurrentLAIOutput(output);
			setCanUndo(aiAssist.hasUndoAction());
		} finally {
			setIsAsking(false);
			requestLockRef.current = false;
		}
	};

	const retryLastPrompt = async () => {
		if (lastPrompt.trim() === "" || isAsking) return;
		await askAI(lastPrompt);
	};

	const refreshQuickPrompts = () => {
		setQuickPrompts(pickQuickPrompts(3));
	};

	const chatTimeline = useMemo(
		() => (
			<AnimatePresence mode="wait">
				{cells.length === 0 ? (
					<IntialInterface />
				) : (
					<motion.div
						className={`flex min-h-full w-full flex-col gap-y-2 px-2 pt-4 pb-20`}
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.3 }}
						exit={{ opacity: 0, y: 10 }}
					>
						{cells.map((cell) => (
							<div key={cell.id} className={`h-max w-full`}>
								{cell.role === "user" ? (
									<UserCell message={cell.message} />
								) : (
									<AICell aiOutput={cell.aiOutput} />
								)}
							</div>
						))}
						{currentLAIOutput ? (
							<AICell
								aiOutput={currentLAIOutput}
								isLatest={true}
								showRetry={
									lastPrompt.trim() !== "" && !isAsking
								}
								onRetry={() => {
									void retryLastPrompt();
								}}
							/>
						) : null}
					</motion.div>
				)}
			</AnimatePresence>
		),
		[cells, currentLAIOutput, isAsking, lastPrompt],
	);

	return (
		<div
			className={twMerge(
				`relative flex h-full w-full flex-col overflow-y-hidden ${theme === LTHEME.DARK ? "bg-linear-to-b from-black via-black via-85% to-white/10" : "bg-linear-to-b from-white via-white via-85% to-black/10"}`,
				className,
			)}
		>
			<AnimatePresence>
				{cells.length > 0 ? (
					<motion.div
						className={`flex h-12 w-full items-center justify-center shadow-sm ${theme === LTHEME.DARK ? "shadow-neutral-800" : "shadow-neutral-200"} shrink-0`}
						initial={{ opacity: 0, y: "-100%" }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.3 }}
						exit={{ opacity: 0, y: "-100%" }}
					>
						<div className={`flex h-max w-max justify-center`}>
							<div className={`h-max w-max`}>
								<span
									className={` ${theme === LTHEME.DARK ? "text-white" : "text-black"} text-lg font-black`}
								>
									L
								</span>
								<span
									className={` ${theme === LTHEME.DARK ? "text-white" : "text-black"} text-3xl font-black`}
								>
									AI
								</span>
							</div>
							<div className={`h-max w-max`}>
								<LUIThemedIcon
									Icon={SparkleIcon}
									color={
										theme === LTHEME.DARK
											? "white"
											: "black"
									}
									weight="fill"
									className={`size-4`}
								/>
							</div>
						</div>
						<button
							data-testid="ai-clear-chat"
							className={`absolute top-2 right-4 flex h-8 w-max cursor-pointer items-center justify-center rounded-lg px-4 py-2 transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${theme === LTHEME.DARK ? "bg-white text-black" : "bg-black text-white"}`}
							onClick={clearChat}
							disabled={isAsking}
						>
							<LUIThemedIcon
								Icon={BroomIcon}
								color={
									theme === LTHEME.DARK ? "black" : "white"
								}
								weight="bold"
								className={`size-4`}
							/>
							<span
								className={`ml-1 ${theme === LTHEME.DARK ? "text-black" : "text-white"} `}
							>
								Clear
							</span>
						</button>
						{canUndo ? (
							<button
								data-testid="ai-undo-last-action"
								className={`absolute top-2 right-28 flex h-8 w-max cursor-pointer items-center justify-center rounded-lg px-4 py-2 transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${theme === LTHEME.DARK ? "bg-neutral-800 text-white" : "bg-neutral-200 text-black"}`}
								onClick={undoLastAction}
								disabled={isAsking}
							>
								<LUIThemedIcon
									Icon={ArrowCounterClockwiseIcon}
									weight="bold"
									className={`size-4`}
								/>
								<span className="ml-1">Undo</span>
							</button>
						) : null}
					</motion.div>
				) : null}
			</AnimatePresence>
			<div
				className={`w-full grow overflow-y-auto pb-20 ${theme}-scrollbar `}
				ref={chatContainerRef}
			>
				{chatTimeline}
			</div>
			<div
				className={`absolute bottom-0 z-10 min-h-20 w-full overflow-hidden px-10 pb-5`}
			>
				{cells.length === 0 && currentLAIOutput === null ? (
					<div className="mb-2 w-full">
						<div className="mb-2 flex w-full items-center justify-between">
							<span
								className={`text-xs ${theme === LTHEME.DARK ? "text-neutral-300" : "text-neutral-600"}`}
							>
								Try one of these ✨
							</span>
							<button
								type="button"
								className={`flex h-7 cursor-pointer items-center gap-x-1 rounded-md px-2 text-xs transition-all active:scale-95 ${
									theme === LTHEME.DARK
										? "bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
										: "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
								}`}
								onClick={refreshQuickPrompts}
							>
								<LUIThemedIcon
									Icon={ArrowClockwiseIcon}
									weight="bold"
									className="size-3"
								/>
								<span>New ideas 🎲</span>
							</button>
						</div>
						<div className="flex w-full flex-wrap gap-2">
							{quickPrompts.map((prompt) => (
								<button
									key={prompt}
									type="button"
									className={`rounded-full border px-3 py-1 text-xs transition-all active:scale-95 ${
										theme === LTHEME.DARK
											? "border-neutral-700 bg-black text-neutral-200 hover:bg-neutral-900"
											: "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100"
									}`}
									onClick={() => {
										setUserInput(prompt);
										textareaRef.current?.focus();
									}}
								>
									{prompt}
								</button>
							))}
						</div>
					</div>
				) : null}
				{isScrolledUp ? (
					<div
						className={`mb-2 flex h-max w-full items-center justify-center`}
					>
						<div
							className={`h-max w-max rounded-full ${
								theme === LTHEME.DARK
									? "bg-black shadow-white/50 hover:bg-neutral-900"
									: "bg-white shadow-black/50 hover:bg-neutral-100"
							} cursor-pointer p-1 shadow-sm transition-transform active:scale-90`}
							onClick={() => {
								if (chatContainerRef.current) {
									chatContainerRef.current.scrollTo({
										top: chatContainerRef.current
											.scrollHeight,
										behavior: "smooth",
									});
								}
							}}
						>
							<LUIThemedIcon
								Icon={ArrowDownIcon}
								color={
									theme === LTHEME.DARK ? "white" : "black"
								}
								weight="bold"
								className={`size-4`}
							/>
						</div>
					</div>
				) : null}
				<AnimatePresence>
					<motion.div
						className={`relative z-0 flex h-max w-full flex-col gap-y-1 rounded-xl border p-1 focus-within:shadow-lg ${
							theme === LTHEME.DARK
								? "border-neutral-700 bg-black shadow-neutral-800"
								: "border-neutral-300 bg-white shadow-neutral-300"
						}`}
						initial={{ opacity: 0, y: 10 }}
						animate={{
							opacity: 1,
							y: 0,
							transition: { delay: 0.3 },
						}}
						transition={{ duration: 0.3 }}
						exit={{ opacity: 0, y: 10 }}
					>
						<div className={`flex h-max w-full items-end gap-x-1`}>
							<div
								className={`h-max grow rounded-xl p-2 focus-within:border-neutral-500`}
							>
								<textarea
									data-testid="ai-assist-input"
									ref={textareaRef}
									className={`h-12 max-h-24 w-full resize-none overflow-auto rounded-xl p-2 text-wrap outline-none ${theme === LTHEME.DARK ? "text-white" : "text-black"} ${theme}-scrollbar`}
									name="message"
									value={userInput}
									onChange={(e) =>
										setUserInput(e.target.value)
									}
									placeholder="Ask AI"
									autoComplete="off"
									autoFocus
									disabled={isAsking}
									onInput={adjustHeight}
									onKeyDown={async (e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											await askAI();
										}
									}}
								/>
							</div>
							<div className={`h-full w-max`}>
								<div
									className={`flex h-12 w-12 items-center justify-center`}
								>
									<button
										className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-all duration-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${theme === LTHEME.DARK ? "bg-white" : "bg-black"}`}
										onClick={() => {
											void askAI();
										}}
										disabled={
											isAsking || userInput.trim() === ""
										}
									>
										<LUIThemedIcon
											Icon={ArrowUpIcon}
											color={
												theme === LTHEME.DARK
													? "black"
													: "white"
											}
											weight="bold"
											className={`size-5`}
										/>
									</button>
								</div>
							</div>
						</div>
					</motion.div>
				</AnimatePresence>
			</div>
		</div>
	);
};

export { Component as LUIAIAssistMain };
