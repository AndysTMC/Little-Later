import {
	LAIOutput,
	LLink,
	LNote,
	LReminder,
	LTask,
	LVisualBM,
} from "little-shared/types";
import { LFACEEXPRESSION_TO_ICON } from "../../../constants";
import { LTHEME, LFACE_EXPRESSION } from "little-shared/enums";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	BroomIcon,
	CircleIcon,
	SparkleIcon,
} from "@phosphor-icons/react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { fakeWait } from "little-shared/utils/misc";
import ReactMarkdown from "react-markdown";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";
import { LittleAI } from "../../../services/ai";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { LUISaveMini } from "../LUISaveMini/Component";
import { LUITaskMini } from "../LUITaskMini/Component";
import { LUIReminderMini } from "../LUIReminderMini/Component";
import { useTheme } from "../../hooks/useTheme";
import { LUINoteNoEdit } from "../LUINoteNoEdit/Component";

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

const UserCell = ({
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

const AICell = ({
	className,
	links,
	notes,
	reminders,
	saves,
	tasks,
	aiOutput,
	isLatest = false,
}: {
	className?: string;
	links: Array<LLink>;
	notes: Array<LNote>;
	reminders: Array<LReminder>;
	saves: Array<LVisualBM>;
	tasks: Array<LTask>;
	aiOutput: LAIOutput;
	isLatest?: boolean;
}) => {
	const { theme } = useTheme();
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
					<div className={`flex h-max w-max`}>
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
				) : null}

				{aiOutput.message ? (
					<div
						className={`h-max max-w-4/5 ${theme === LTHEME.DARK ? "text-white" : "text-black"} py-1 wrap-break-word`}
					>
						<ReactMarkdown>
							{aiOutput.message
								.replace(/<think>.*?<\/think>/gs, "")
								.trim()}
						</ReactMarkdown>
					</div>
				) : null}

				{aiOutput.content ? (
					<div className={`flex h-max w-full flex-col gap-y-1`}>
						{aiOutput.content.saves.map((save, index) => (
							<LUISaveMini
								links={links}
								notes={notes}
								reminders={reminders}
								tasks={tasks}
								save={save}
								key={index}
								disableNavs
							/>
						))}
						{aiOutput.content.tasks.map((task, index) => (
							<LUITaskMini
								links={links}
								reminders={reminders}
								saves={saves}
								task={task}
								key={index}
								disableNavs
							/>
						))}
						{aiOutput.content.reminders.map((reminder, index) => (
							<LUIReminderMini
								links={links}
								saves={saves}
								reminder={reminder}
								key={index}
								disableNavs
							/>
						))}
						{aiOutput.content.notes.map((note, index) => (
							<LUINoteNoEdit key={index} note={note} />
						))}
					</div>
				) : null}
			</div>
		</div>
	);
};

const Component = ({
	className,
	links,
	notes,
	reminders,
	saves,
	tasks,
}: {
	className?: string;
	links: Array<LLink>;
	notes: Array<LNote>;
	reminders: Array<LReminder>;
	saves: Array<LVisualBM>;
	tasks: Array<LTask>;
}) => {
	const { theme } = useTheme();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const chatContainerRef = useRef<HTMLDivElement>(null);

	const adjustHeight = () => {
		if (!textareaRef.current) return;
		const textarea = textareaRef.current;
		textarea.style.height = "48px";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`;
	};

	const [userInput, setUserInput] = useState<string>("");

	const [cells, setCells] = useState<ReactNode[]>([]);

	const [aiAssist, setAIAsist] = useState<LittleAI | undefined>();
	const [currentLAIOutput, setCurrentLAIOutput] = useState<LAIOutput | null>(
		null,
	);

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
			});
		}
	}, []);

	const askAI = async () => {
		if (!aiAssist) return;
		if (userInput.trim() === "") return;
		if (currentLAIOutput) {
			setCells((prevCells) => [
				...prevCells,
				<AICell
					links={links}
					notes={notes}
					reminders={reminders}
					saves={saves}
					tasks={tasks}
					aiOutput={currentLAIOutput}
				/>,
			]);
			setCurrentLAIOutput(null);
		}
		setUserInput("");
		setCells((prevCells) => [
			...prevCells,
			<UserCell message={userInput} />,
		]);
		setCurrentLAIOutput({
			message: "",
			actions: [],
			expression: LFACE_EXPRESSION.THINKING,
		});
		await fakeWait();
		const aiOutput = await aiAssist.prompt(userInput);
		if (aiOutput.actions.length > 0) {
			setCells((prevCells) => [
				...prevCells,
				<AICell
					links={links}
					notes={notes}
					reminders={reminders}
					saves={saves}
					tasks={tasks}
					aiOutput={aiOutput}
				/>,
			]);
			setCurrentLAIOutput({
				message: "",
				actions: aiOutput.actions,
				expression: LFACE_EXPRESSION.THINKING,
			});
		} else {
			setCurrentLAIOutput(aiOutput);
		}
	};

	const clearChat = () => {
		if (!aiAssist) return;
		setCells([]);
		setCurrentLAIOutput(null);
		setUserInput("");
		aiAssist.clear();
	};

	const handleActionProceed = async () => {
		if (!aiAssist) return;
		if (currentLAIOutput?.actions) {
			for (const action of currentLAIOutput.actions) {
				await action();
			}
			const actionSuccessMessage = await aiAssist.rewrite(
				"Your request has been successfully processed.",
				{
					tone: "more-formal",
					format: "plain-text",
					length: "as-is",
					sharedContext: "This is a response from an AI assistant.",
				},
			);
			setCurrentLAIOutput({
				message: actionSuccessMessage,
				actions: [],
				expression: LFACE_EXPRESSION.SLIGHTLY_SMILING,
			});
		}
	};

	const handleActionCancel = async () => {
		if (!aiAssist) return;
		if (currentLAIOutput?.actions) {
			const actionCancelMessage = await aiAssist.rewrite(
				"Your request has been cancelled.",
				{
					tone: "more-formal",
					format: "plain-text",
					length: "as-is",
					sharedContext: "This is a response from an AI assistant.",
				},
			);
			setCurrentLAIOutput({
				message: actionCancelMessage,
				actions: [],
				expression: LFACE_EXPRESSION.FROWNING,
			});
		}
	};

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
							className={`flex h-8 w-max items-center justify-center rounded-lg ${theme === LTHEME.DARK ? "bg-white text-black" : "bg-black text-white"} absolute top-2 right-4 cursor-pointer px-4 py-2 transition-all duration-200 active:scale-95`}
							onClick={clearChat}
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
					</motion.div>
				) : null}
			</AnimatePresence>
			<div
				className={`w-full grow overflow-y-auto pb-20 ${theme}-scrollbar `}
				ref={chatContainerRef}
			>
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
							{cells.map((cell, index) => (
								<div key={index} className={`h-max w-full`}>
									{cell}
								</div>
							))}
							{currentLAIOutput ? (
								<AICell
									links={links}
									notes={notes}
									reminders={reminders}
									saves={saves}
									tasks={tasks}
									aiOutput={currentLAIOutput}
									isLatest={true}
								/>
							) : null}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
			<div
				className={`absolute bottom-0 z-10 min-h-20 w-full overflow-hidden px-10 pb-5`}
			>
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
					{(currentLAIOutput?.actions.length ?? 0) === 0 ? (
						<motion.div
							className={`flex h-max w-full flex-col gap-y-1 rounded-xl border ${
								theme === LTHEME.DARK
									? "border-neutral-700 bg-black shadow-neutral-800"
									: "border-neutral-300 bg-white shadow-neutral-300"
							} relative z-0 p-1 focus-within:shadow-lg`}
							initial={{ opacity: 0, y: 10 }}
							animate={{
								opacity: 1,
								y: 0,
								transition: { delay: 0.3 },
							}}
							transition={{ duration: 0.3 }}
							exit={{ opacity: 0, y: 10 }}
						>
							<div
								className={`flex h-max w-full items-end gap-x-1`}
							>
								<div
									className={`h-max grow rounded-xl p-2 focus-within:border-neutral-500`}
								>
									<textarea
										ref={textareaRef}
										className={`h-12 max-h-24 w-full ${theme === LTHEME.DARK ? "text-white" : "text-black"} rounded-xl p-2 text-wrap outline-none ${theme}-scrollbar resize-none overflow-auto`}
										name="message"
										value={userInput}
										onChange={(e) =>
											setUserInput(e.target.value)
										}
										placeholder="Ask AI"
										autoComplete="off"
										autoFocus
										onInput={adjustHeight}
										onKeyDown={async (e) => {
											if (
												e.key === "Enter" &&
												!e.shiftKey
											) {
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
											className={`h-9 w-9 ${theme === LTHEME.DARK ? "bg-white" : "bg-black"} flex cursor-pointer items-center justify-center rounded-full transition-all duration-50 active:scale-95`}
											onClick={askAI}
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
					) : null}
				</AnimatePresence>
				<AnimatePresence>
					{(currentLAIOutput?.actions.length ?? 0) > 0 ? (
						<motion.div
							className={`flex h-max w-full gap-x-2 rounded-xl border ${
								theme === LTHEME.DARK
									? "border-neutral-800 bg-black shadow-white/25 focus-within:border-neutral-700"
									: "border-neutral-200 bg-white shadow-black/25 focus-within:border-neutral-300"
							} relative z-10 p-2 shadow-lg focus-within:shadow-xl`}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.3 }}
							exit={{ opacity: 0, y: 10 }}
						>
							<button
								className={`w-1/2 p-2 ${
									theme === LTHEME.DARK
										? "bg-white text-black hover:bg-neutral-100"
										: "bg-black text-white hover:bg-neutral-900"
								} cursor-pointer rounded-lg transition-all duration-200 active:scale-95`}
								onClick={handleActionProceed}
							>
								Proceed
							</button>
							<button
								className={`w-1/2 p-2 ${
									theme === LTHEME.DARK
										? "bg-neutral-900 text-white hover:bg-neutral-800"
										: "bg-neutral-100 text-black hover:bg-neutral-200"
								} cursor-pointer rounded-lg transition-all duration-200 active:scale-95`}
								onClick={handleActionCancel}
							>
								Cancel
							</button>
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
		</div>
	);
};

export { Component as LUIAIAssistMain };
