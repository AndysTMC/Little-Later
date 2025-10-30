import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { twMerge } from "tailwind-merge";

export const Component = ({ className }: { className?: string }) => {
	const { theme } = useTheme();

	const colors =
		theme === LTHEME.DARK
			? {
					squareDefault: "#525252",
					squareActive: "#f5f5f5",
				}
			: {
					squareDefault: "#a3a3a3",
					squareActive: "#171717",
				};

	return (
		<div
			className={twMerge(
				"flex h-full w-full items-center justify-center",
				className,
			)}
		>
			<div className="relative">
				<div className="flex flex-col space-y-2">
					{[...Array(2)].map((_, i) => (
						<div
							key={`vertical-${i}`}
							className="h-6 w-6 rounded-sm"
							style={{
								backgroundColor: colors.squareDefault,
								animationName: `wave-${theme}`,
								animationDuration: "0.9s",
								animationTimingFunction:
									"cubic-bezier(0.25, 0.46, 0.45, 0.94)",
								animationIterationCount: "infinite",
								animationDelay: `${i * 0.18}s`,
							}}
						></div>
					))}
				</div>

				<div className="mt-2 flex space-x-2">
					{[...Array(3)].map((_, i) => (
						<div
							key={`horizontal-${i}`}
							className="h-6 w-6 rounded-sm"
							style={{
								backgroundColor: colors.squareDefault,
								animationName: `wave-${theme}`,
								animationDuration: "0.9s",
								animationTimingFunction:
									"cubic-bezier(0.25, 0.46, 0.45, 0.94)",
								animationIterationCount: "infinite",
								animationDelay: `${(2 + i) * 0.18}s`,
							}}
						></div>
					))}
				</div>
			</div>

			<style>{`
				@keyframes wave-${LTHEME.DARK} {
					0%,
					80%,
					100% {
						background-color: #525252;
						transform: scale(1) translateY(0);
					}
					25%,
					60% {
						background-color: #f5f5f5;
						transform: scale(1.08) translateY(-1px);
					}
				}

				@keyframes wave-${LTHEME.LIGHT} {
					0%,
					80%,
					100% {
						background-color: #a3a3a3;
						transform: scale(1) translateY(0);
					}
					25%,
					60% {
						background-color: #171717;
						transform: scale(1.08) translateY(-1px);
					}
				}
			`}</style>
		</div>
	);
};

export { Component as LUILoading };
