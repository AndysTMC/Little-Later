import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useTheme } from "../../hooks/useTheme";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { LTHEME } from "little-shared/enums";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import {
	ArrowRightIcon,
	CaretLeftIcon,
	CaretRightIcon,
	MoonIcon,
	SunDimIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { markGettingStarted } from "../../../services/settings";

interface Illustration {
	image: string;
	caption: string;
}

const DefaultGuide = ({
	shortQuote,
	longQuote,
	illustrations,
	displayStep,
}: {
	shortQuote: string;
	longQuote: string;
	illustrations: Array<Illustration>;
	displayStep: number;
}) => {
	const { theme } = useTheme();
	const illustrationsRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const startTimeRef = useRef<number | null>(null);
	const currentPositionRef = useRef<number>(0);

	useEffect(() => {
		const element = illustrationsRef.current;
		if (!element || illustrations.length === 0) return;

		const itemWidth = 336;
		const fullSetWidth = itemWidth * illustrations.length;
		const speed = 50;
		const duration = fullSetWidth / speed;

		let animationId: number;

		const animate = (timestamp: number) => {
			if (startTimeRef.current === null) {
				startTimeRef.current =
					timestamp - (currentPositionRef.current / speed) * 1000;
			}

			const elapsed = timestamp - startTimeRef.current;
			const progress = (elapsed / (duration * 1000)) % 1;
			const xPos = -progress * fullSetWidth;

			currentPositionRef.current = Math.abs(xPos) % fullSetWidth;

			if (element) {
				element.style.transform = `translateX(${xPos}px)`;
			}

			animationId = requestAnimationFrame(animate);
		};

		animationId = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(animationId);
			startTimeRef.current = null;
		};
	}, [illustrations.length, displayStep]);
	const continuousIllustrations =
		illustrations.length > 0 ? [...illustrations, ...illustrations] : [];

	const isNumberInSeries = (
		number: number,
		firstNumber: number,
		difference: number,
	) => {
		return (number - firstNumber) % difference === 0;
	};

	const shouldDisplayFirst = () => {
		return (
			isNumberInSeries(displayStep, 1, 3) ||
			isNumberInSeries(displayStep, 2, 3) ||
			isNumberInSeries(displayStep, 3, 3)
		);
	};

	const shouldDisplaySecond = () => {
		return (
			isNumberInSeries(displayStep, 2, 3) ||
			isNumberInSeries(displayStep, 3, 3)
		);
	};
	useEffect(() => {
		if (
			isNumberInSeries(displayStep, 3, 3) &&
			containerRef.current &&
			illustrationsRef.current
		) {
			setTimeout(() => {
				const container = containerRef.current;
				const illustrations =
					illustrationsRef.current as unknown as HTMLElement;
				if (container && illustrations) {
					container.scrollTo({
						top: illustrations.offsetTop,
						behavior: "smooth",
					});
				}
			}, 300);
		}
	}, [displayStep]);
	return (
		<motion.div
			ref={containerRef}
			className={`no-scrollbar flex h-full w-full flex-col overflow-y-auto`}
			initial={{ opacity: 0, x: "-100%" }}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: "-100%" }}
			transition={{ duration: 0.4, type: "spring", bounce: 0.2 }}
		>
			{shouldDisplayFirst() ? (
				<motion.div
					className={`h-max w-full ${isNumberInSeries(displayStep, 1, 3) ? (theme === LTHEME.DARK ? "text-neutral-100" : "text-neutral-900") : theme === LTHEME.DARK ? "text-neutral-600" : "text-neutral-400"} px-2 text-lg font-bold italic`}
					initial={{ opacity: 0 }}
					animate={{
						opacity: 1,
						transition: { duration: 0.4 },
					}}
					exit={{ opacity: 0, transition: { duration: 0.4 } }}
				>
					{shortQuote}
				</motion.div>
			) : null}
			{shouldDisplaySecond() ? (
				<motion.div
					className={`h-max w-full ${isNumberInSeries(displayStep, 2, 3) ? (theme === LTHEME.DARK ? "text-neutral-100" : "text-neutral-900") : theme === LTHEME.DARK ? "text-neutral-600" : "text-neutral-400"} px-2 text-2xl font-extrabold text-balance`}
					initial={{ opacity: 0 }}
					animate={{
						opacity: 1,
						transition: { duration: 0.4 },
					}}
					exit={{ opacity: 0, transition: { duration: 0.4 } }}
				>
					{longQuote}
				</motion.div>
			) : null}
			{isNumberInSeries(displayStep, 3, 3) ? (
				<motion.div
					ref={illustrationsRef}
					className="w-full shrink-0 overflow-visible"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1, transition: { duration: 0.4 } }}
					exit={{ opacity: 0, transition: { duration: 0.4 } }}
				>
					{continuousIllustrations.length > 0 ? (
						<div className="flex gap-8 p-4">
							{continuousIllustrations.map(
								(illustration, index) => (
									<div
										key={index}
										className="flex w-80 flex-col items-center"
									>
										<div className="relative aspect-video h-44 overflow-hidden rounded-lg border border-neutral-500">
											<img
												src={illustration.image}
												alt={illustration.caption}
												className={`h-full w-full object-cover shadow-md transition-all duration-200 ${theme === LTHEME.DARK ? "shadow-neutral-800" : "shadow-neutral-300"} pointer-events-none select-none`}
												draggable="false"
											/>
										</div>
										<p
											className={`mt-2 px-2 text-center text-sm ${theme === LTHEME.DARK ? "text-neutral-300" : "text-neutral-700"}`}
										>
											{illustration.caption}
										</p>
									</div>
								),
							)}
						</div>
					) : null}
				</motion.div>
			) : null}
		</motion.div>
	);
};

const StartGuide = () => {
	const { theme } = useTheme();
	return (
		<motion.div
			className={`flex h-full w-full flex-col justify-start gap-y-2 px-2`}
			initial={{ opacity: 0, x: "-100%" }}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: "-100%" }}
			transition={{ duration: 0.4, type: "spring", bounce: 0.2 }}
		>
			<div className={`h-max w-full text-7xl font-black`}>
				<motion.div
					className={`${theme === LTHEME.DARK ? "text-neutral-500" : "text-neutral-500"}`}
					initial={{ opacity: 0 }}
					animate={{
						opacity: 1,
						transition: { duration: 0.4, delay: 0.2 },
					}}
					exit={{ opacity: 0, transition: { duration: 0.4 } }}
				>
					Welcome
				</motion.div>
				<motion.div
					className={`${theme === LTHEME.DARK ? "text-neutral-300" : "text-neutral-700"}`}
					initial={{ opacity: 0 }}
					animate={{
						opacity: 1,
						transition: { duration: 0.4, delay: 0.4 },
					}}
					exit={{ opacity: 0, transition: { duration: 0.4 } }}
				>
					to
				</motion.div>
				<motion.div
					className={`${theme === LTHEME.DARK ? "text-neutral-100" : "text-neutral-900"}`}
					initial={{ opacity: 0 }}
					animate={{
						opacity: 1,
						transition: { duration: 0.4, delay: 0.6 },
					}}
					exit={{ opacity: 0, transition: { duration: 0.4 } }}
				>
					Little Later
				</motion.div>
			</div>
			<motion.div
				className={`flex h-max flex-col justify-start`}
				initial={{ opacity: 0 }}
				animate={{
					opacity: 1,
					transition: { duration: 0.4, delay: 1 },
				}}
				exit={{ opacity: 0, transition: { duration: 0.4 } }}
			>
				<div
					className={`h-max w-full text-2xl font-thin ${theme === LTHEME.DARK ? "text-neutral-600" : "text-neutral-400"} `}
				>
					Let's get started!
				</div>
			</motion.div>
		</motion.div>
	);
};

const Page = () => {
	const { theme, toggleTheme } = useTheme();
	const navigate = useNavigate();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideLeft,
	});
	const handlePreviousStep = () => {
		if (displayStep === 0) {
			navigate("/home", {
				state: { entryTransition: entryTransitions.slideLeft },
			});
		} else {
			setDisplayStep((prev) => prev - 1);
		}
	};
	const [displayStep, setDisplayStep] = useState(0);
	const handleNextStep = async () => {
		if (displayStep === 24) {
			await markGettingStarted();
			navigate("/home", {
				state: { entryTransition: entryTransitions.slideLeft },
			});
		} else {
			setDisplayStep((prev) => prev + 1);
		}
	};
	const handleSkip = async () => {
		await markGettingStarted();
		navigate("/home", {
			state: { entryTransition: entryTransitions.slideLeft },
		});
	};
	return (
		<motion.div
			className={`flex h-full w-full flex-col gap-y-2 select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-hidden pt-2`}
			{...entry}
			{...exit}
		>
			<div
				className={`flex h-12 w-full shrink-0 items-center justify-end gap-x-4 px-5`}
			>
				<button
					className={`h-max w-max ${
						theme === LTHEME.DARK
							? "hover:bg-neutral-800"
							: "hover:bg-neutral-200"
					} cursor-pointer rounded-full p-1`}
					onClick={toggleTheme}
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							toggleTheme();
						}
					}}
				>
					<LUIThemedIcon
						Icon={theme === LTHEME.DARK ? MoonIcon : SunDimIcon}
						weight="fill"
						className="size-7"
					/>
				</button>
				<button
					className={`flex h-max w-max items-center justify-center gap-x-1 rounded-md px-4 py-1 active:scale-95 ${theme === LTHEME.DARK ? "bg-neutral-800 text-white" : "bg-neutral-200 text-black"} group cursor-pointer transition-all duration-200`}
					onClick={handleSkip}
				>
					<span className={`font-semibold`}>Skip</span>
					<span className={`h-max w-max`}>
						<LUIThemedIcon
							Icon={ArrowRightIcon}
							weight="regular"
							className={` `}
						/>
					</span>
				</button>
			</div>
			<div className={`w-full grow overflow-x-clip overflow-y-hidden`}>
				<AnimatePresence mode="wait">
					{displayStep === 0 ? (
						<StartGuide key="start-guide" />
					) : displayStep >= 1 && displayStep <= 3 ? (
						<DefaultGuide
							key="guide-1-3"
							shortQuote="Visual Bookmarks: More Than Just (Traditional) Bookmarks"
							longQuote="Save the final moment of your browsing—preserving not just where you were, but how it looked when you left."
							illustrations={[
								{
									image: "/images/guide/visualBM/1r.png",
									caption:
										"Keep your favorite websites handy as visual bookmarks",
								},
								{
									image: "/images/guide/visualBM/2r.png",
									caption:
										"History is your quick access to all the websites you've visited",
								},
								{
									image: "/images/guide/visualBM/3r.png",
									caption:
										"View all your saved visual bookmarks in the Saves tab",
								},
							]}
							displayStep={displayStep}
						/>
					) : displayStep >= 4 && displayStep <= 6 ? (
						<DefaultGuide
							key="guide-4-6"
							shortQuote="Tasks: Organize & Accomplish"
							longQuote="Stay on track with tasks—some quick, some recurring, all designed to keep your progress clear and your goals in motion."
							illustrations={[
								{
									image: "/images/guide/task/1r.png",
									caption:
										"Add all the activities you do in or related to your web browser.",
								},
								{
									image: "/images/guide/task/2r.png",
									caption:
										"Create a task tailored to your preferences.",
								},
								{
									image: "/images/guide/task/3r.png",
									caption:
										"All your tasks are organized in the Tasks tab",
								},
							]}
							displayStep={displayStep}
						/>
					) : displayStep >= 7 && displayStep <= 9 ? (
						<DefaultGuide
							key="guide-7-9"
							shortQuote="Reminders: Your Digital Memory, Always On Time"
							longQuote="Get gentle nudges right when you need them—each reminder tuned to your timing, helping you stay focused and on schedule."
							illustrations={[
								{
									image: "/images/guide/reminder/1r.png",
									caption:
										"Never miss what matters—set a reminder and get notified",
								},
								{
									image: "/images/guide/reminder/2r.png",
									caption:
										"Create a reminder that suits your needs",
								},
								{
									image: "/images/guide/reminder/3r.png",
									caption:
										"All your reminders are organized in the Reminders tab",
								},
							]}
							displayStep={displayStep}
						/>
					) : displayStep >= 10 && displayStep <= 12 ? (
						<DefaultGuide
							key="guide-10-12"
							shortQuote="Your Digital Notebook"
							longQuote="Keep your thoughts organized—notes store ideas, moments, and insights, ready to revisit whenever inspiration strikes again."
							illustrations={[
								{
									image: "/images/guide/notebook/1r.png",
									caption:
										"Don't clutter your memory—just jot it down!",
								},
								{
									image: "/images/guide/notebook/2r.png",
									caption:
										"Quickly save selected text to notes from the menu.",
								},
								{
									image: "/images/guide/notebook/3r.png",
									caption:
										"All your notes are organized in your Notebook",
								},
							]}
							displayStep={displayStep}
						/>
					) : displayStep >= 13 && displayStep <= 15 ? (
						<DefaultGuide
							key="guide-13-15"
							shortQuote="Smart Integrations: Everything Connected"
							longQuote="Seamless connections bring your information together—integrations unite tasks, notes, and saves, making your workspace smarter and more powerful."
							illustrations={[
								{
									image: "/images/guide/integration/1r.png",
									caption:
										"All you saves, tasks, reminders and notes linked together to boost your productivity.",
								},
								{
									image: "/images/guide/integration/2r.png",
									caption:
										"Make a note tied to a visual bookmark.",
								},
								{
									image: "/images/guide/integration/3r.png",
									caption:
										"Create a task connecting a visual bookmark and a reminder effortlessly",
								},
								{
									image: "/images/guide/integration/4r.png",
									caption:
										"Set a reminder linked to a visual bookmark.",
								},
							]}
							displayStep={displayStep}
						/>
					) : displayStep >= 16 && displayStep <= 18 ? (
						<DefaultGuide
							key="guide-16-18"
							shortQuote="Multiple profiles, one seamless space."
							longQuote="Have more than one side? Create distinct profiles for each, tailored to your needs and how you use this space."
							illustrations={[
								{
									image: "/images/guide/profile/1r.png",
									caption:
										"Create, import or unlock profiles easily.",
								},
								{
									image: "/images/guide/profile/2r.png",
									caption:
										"Create a new profile effortlessly.",
								},
								{
									image: "/images/guide/profile/3r.png",
									caption:
										"Managing multiple profiles lets you organize your data efficiently.",
								},
							]}
							displayStep={displayStep}
						/>
					) : displayStep >= 19 && displayStep <= 21 ? (
						<DefaultGuide
							key="guide-19-21"
							shortQuote="AI that powers productivity."
							longQuote="Embedded almost everywhere to help you stay organized, think smarter, and manage your data efficiently."
							illustrations={[
								{
									image: "/images/guide/ai/1r.png",
									caption:
										"Let AI assist you in analyzing and organizing your data.",
								},
								{
									image: "/images/guide/ai/2r.png",
									caption:
										"Create summaries, extract key points and generate insights with ease.",
								},
								{
									image: "/images/guide/ai/3r.png",
									caption:
										"Manage the configurations of AI to suit your needs.",
								},
							]}
							displayStep={displayStep}
						/>
					) : displayStep >= 22 && displayStep <= 24 ? (
						<DefaultGuide
							key="guide-22-24"
							shortQuote="Lock it, have the control."
							longQuote="Your privacy, sealed tight—only you hold the key, ensuring your data stays secure and untouched until you unlock it again."
							illustrations={[
								{
									image: "/images/guide/lock/1r.png",
									caption:
										"Giving you the power to protect your data with ease.",
								},
								{
									image: "/images/guide/lock/2r.png",
									caption:
										"Set a password to lock your profile quickly.",
								},
								{
									image: "/images/guide/lock/3r.png",
									caption:
										"Unlock your profile securely when needed.",
								},
							]}
							displayStep={displayStep}
						/>
					) : null}
				</AnimatePresence>
			</div>
			<div
				className={`flex h-max w-full shrink-0 items-start justify-between px-5`}
			>
				<button
					className={`h-max w-32 px-2 py-1 ${theme === LTHEME.DARK ? "text-white" : "text-black"} ${displayStep === 0 ? "invisible" : ""} flex cursor-pointer items-center justify-start gap-x-1 opacity-50 transition-all duration-200 hover:gap-x-0.5 hover:opacity-100`}
					onClick={handlePreviousStep}
				>
					<LUIThemedIcon
						Icon={CaretLeftIcon}
						weight="regular"
						className={`size-5`}
					/>
					<span className={`text-lg font-semibold`}>Previous</span>
				</button>
				<img
					src={`/images/${theme}-icon.png`}
					alt="Little Later Logo"
					className={`h-20 opacity-10`}
					draggable="false"
				/>
				<button
					className={`h-max w-32 px-2 py-1 ${theme === LTHEME.DARK ? "text-white" : "text-black"} flex cursor-pointer items-center justify-end gap-x-1 opacity-50 transition-all duration-200 hover:gap-x-0.5 hover:opacity-100`}
					onClick={handleNextStep}
				>
					<span className={`text-lg font-semibold`}>Next</span>
					<LUIThemedIcon
						Icon={CaretRightIcon}
						weight="regular"
						className={`size-5`}
					/>
				</button>
			</div>
		</motion.div>
	);
};

export { Page as LUIGettingStarted };
