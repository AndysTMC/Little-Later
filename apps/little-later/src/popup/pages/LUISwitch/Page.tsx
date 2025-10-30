import { LTHEME } from "little-shared/enums";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useLLConfig } from "../../hooks/useLLConfig";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { updateLLConfig } from "../../../utils/littleLocal";
import { switchToChrome, switchToLittleLocal } from "../../../services/switch";
import { fakeWait } from "little-shared/utils/misc";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { twMerge } from "tailwind-merge";

const ChromeStorageSetupInfo = ({ className }: { className?: string }) => {
	return (
		<div className={twMerge(`w-full`, className)}>
			<ul className="space-y-2">
				<li className="flex items-start gap-2">
					<span className="mt-1 text-black">•</span>
					<span>
						<span className="font-semibold">
							Profile-Specific Data:
						</span>{" "}
						Extension data is stored separately for each Chrome
						profile, so each profile maintains its own data.
					</span>
				</li>
				<li className="flex items-start gap-2">
					<span className="mt-1 text-black">•</span>
					<span>
						<span className="font-semibold">Chrome Storage:</span>{" "}
						Data is stored locally and accessible only to this
						extension
					</span>
				</li>
				<li className="flex items-start gap-2">
					<span className="mt-1 text-black">•</span>
					<span>
						<span className="font-semibold">
							Direct API Requests:
						</span>{" "}
						API requests are sent directly from the extension, which
						means API keys are exposed in the request.
					</span>
				</li>
				<li className="flex items-start gap-2">
					<span className="mt-1 text-black">•</span>
					<span>
						<span className="font-semibold">
							Chrome Notifications:
						</span>{" "}
						Reminders use Chrome-specific notifications that only
						work while Chrome is in use.
					</span>
				</li>
			</ul>
		</div>
	);
};

const LittleLocalSetupInfo = ({ className }: { className?: string }) => {
	return (
		<div className={twMerge(`w-full`, className)}>
			<ul className="space-y-2">
				<li className="flex items-start gap-2">
					<span className="mt-1 text-black">•</span>
					<span>
						<span className="font-semibold">
							Cross Profile Sharing:
						</span>{" "}
						Extension data syncs across all Chrome profiles, so you
						can use the extension everywhere with the same data.
					</span>
				</li>
				<li className="flex items-start gap-2">
					<span className="mt-1 text-black">•</span>
					<span>
						<span className="font-semibold">Local Storage:</span>{" "}
						All your data is stored locally on your device.
					</span>
				</li>
				<li className="flex items-start gap-2">
					<span className="mt-1 text-black">•</span>
					<span>
						<span className="font-semibold">
							Secure AI Requests:
						</span>{" "}
						API requests are routed through Little Local, keeping
						your API keys safe and private.
					</span>
				</li>
				<li className="flex items-start gap-2">
					<span className="mt-1 text-black">•</span>
					<span>
						<span className="font-semibold">
							Native Notifications:
						</span>{" "}
						Reminders use electron notifications that work even when
						Chrome is closed.
					</span>
				</li>
			</ul>
		</div>
	);
};

const Page = () => {
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});

	const littleLocalConfig = useLLConfig();

	const navigate = useNavigate();

	const handleUseLittleLocal = async () => {
		await fakeWait();
		await switchToLittleLocal();
		await updateLLConfig({ isEnabled: true });
		navigate("/browse-profiles", {
			state: { entryTransition: entryTransitions.slideRight },
		});
	};

	const handleUseChrome = async () => {
		await fakeWait();
		await switchToChrome();
		navigate("/browse-profiles", {
			state: { entryTransition: entryTransitions.slideRight },
		});
	};
	return (
		<motion.div
			className={`flex h-full w-full flex-col bg-white select-none`}
			{...entry}
			{...exit}
		>
			<LUIBasicNav
				navigateTo="/browse-profiles"
				passedTheme={LTHEME.LIGHT}
			/>
			<div
				className={`flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-hidden`}
			>
				<div
					className={`mt-5 flex w-full items-center justify-center text-4xl font-semibold text-black`}
				>
					<span>
						{littleLocalConfig.isEnabled == false
							? "Use Little Local"
							: "Use Chrome"}
					</span>
				</div>

				<div className={`flex w-full grow flex-col gap-y-5 px-12`}>
					{littleLocalConfig.isEnabled == false ? (
						<LittleLocalSetupInfo />
					) : (
						<ChromeStorageSetupInfo />
					)}
					<div className={`flex w-full justify-center`}>
						<LUICUButton
							name="Proceed"
							onClick={
								littleLocalConfig.isEnabled == false
									? handleUseLittleLocal
									: handleUseChrome
							}
							passedTheme={LTHEME.LIGHT}
						/>
					</div>
				</div>
			</div>
		</motion.div>
	);
};

export { Page as LUISwitch };
