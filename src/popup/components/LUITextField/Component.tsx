import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { CopyIcon, EyeIcon, EyeClosedIcon } from "@phosphor-icons/react";
import { twMerge } from "tailwind-merge";
import { LUILabel } from "../LUILabel/Component";

const Component = ({
	className,
	name,
	passedValue,
	isConfidential = false,
	canCopy = false,
}: {
	className?: string;
	name: string;
	passedValue: string;
	isConfidential?: boolean;
	canCopy?: boolean;
}) => {
	const [focused, setFocused] = useState(false);
	const { theme } = useTheme();
	const [showValue, setShowValue] = useState(!isConfidential);
	const [isCopied, setIsCopied] = useState(false);
	const toggleShowValue = () => {
		setShowValue((prev) => !prev);
	};
	const handleCopy = () => {
		if (canCopy) {
			navigator.clipboard
				.writeText(passedValue)
				.then(() => {
					console.log("Copied to clipboard:", passedValue);
				})
				.catch((error) => {
					console.error("Failed to copy:", error);
				});
		}
		setIsCopied(true);
		setTimeout(() => {
			setIsCopied(false);
		}, 1000);
	};
	return (
		<div
			className={twMerge(
				`my-1 flex h-max w-full flex-col items-start justify-center`,
				className,
			)}
		>
			<div className={`h-5 w-full px-3`}>
				<AnimatePresence>
					{focused || passedValue.length > 0 ? (
						<motion.div
							className={`z-0 h-max w-max`}
							initial={{ y: "100%" }}
							animate={{
								y: 0,
								transition: { duration: 0.3 },
							}}
							exit={{
								y: "100%",
								transition: { duration: 0.3 },
							}}
						>
							<LUILabel name={name} className="px-4" />
						</motion.div>
					) : null}
				</AnimatePresence>
			</div>
			<div
				className={`flex h-10 w-full items-center justify-start gap-x-1 border ${
					theme === LTHEME.DARK
						? "border-neutral-700 bg-black text-white focus:border-neutral-300"
						: "border-neutral-300 bg-white text-black focus:border-neutral-700"
				} z-10 rounded-xl pl-4 ${isConfidential ? "pr-1" : "pr-4"} transition-all duration-300 outline-none`}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
			>
				<div
					className={`line-clamp-1 grow text-base break-all text-ellipsis`}
				>
					{showValue || !isConfidential
						? passedValue
						: "*".repeat(passedValue.length)}
				</div>
				{isConfidential ? (
					<button
						className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg ${theme === LTHEME.DARK ? "border-neutral-700 hover:bg-neutral-900" : "border-neutral-300 hover:bg-neutral-100"} `}
						onClick={toggleShowValue}
					>
						<LUIThemedIcon
							Icon={showValue ? EyeIcon : EyeClosedIcon}
							weight="regular"
							className={`size-6`}
						/>
					</button>
				) : null}
				{canCopy ? (
					<button
						className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg ${theme === LTHEME.DARK ? "border-neutral-700 hover:bg-neutral-900" : "border-neutral-300 hover:bg-neutral-100"} `}
						onClick={handleCopy}
					>
						<LUIThemedIcon
							Icon={CopyIcon}
							weight={isCopied ? "fill" : "regular"}
							className={`size-6`}
						/>
					</button>
				) : null}
			</div>
		</div>
	);
};

export { Component as LUITextField };
