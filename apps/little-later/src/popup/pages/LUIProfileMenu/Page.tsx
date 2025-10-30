import { useNavigate } from "react-router";
import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import React, { useRef } from "react";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { ArrowRightIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { importData } from "../../../services/dataExchange";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIProfileMini } from "../../components/LUIProfileMini/Component";
import { useUserProfiles } from "../../hooks/useUserProfiles";
import { LUILoading } from "../../components/LUILoading/Component";
import { useLoading } from "../../hooks/useLoading";
import { useLLConfig } from "../../hooks/useLLConfig";

const Page = () => {
	const { entry, exit, setExit } = useLittleTransition({});
	const navigate = useNavigate();

	const llConfig = useLLConfig();

	const userProfiles = useUserProfiles();

	const loading = useLoading([userProfiles]);

	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleNewProfile = () => {
		setExit(exitTransitions.slideLeft);
		navigate("/new-profile", {
			state: { entryTransition: entryTransitions.slideLeft },
		});
	};

	const handleImportProfile = () => {
		fileInputRef.current?.click();
	};

	const handleFileInputChange = async (
		e: React.ChangeEvent<HTMLInputElement>,
	) => {
		if (!e.target.files?.length) return;
		const blob = e.target.files[0];
		await importData(blob);
	};

	const handleUseStorageProvider = () => {
		setExit(exitTransitions.slideLeft);
		navigate("/switch-storage", {
			state: { entryTransition: entryTransitions.slideLeft },
		});
	};

	return (
		<motion.div
			className={`flex h-full w-full flex-col bg-white select-none`}
			{...entry}
			{...exit}
		>
			{loading ? (
				<LUILoading />
			) : (
				<motion.div
					className={`flex h-full w-full flex-col overflow-y-hidden`}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
				>
					<LUIBasicNav goBackDisabled passedTheme={LTHEME.LIGHT} />
					<div
						className={`flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-hidden`}
					>
						<div
							className={`mt-5 flex items-center justify-center text-4xl font-semibold text-black`}
						>
							Choose Profile
						</div>
						<div className="w-full grow overflow-y-hidden px-10 pt-5 pb-1">
							<div
								className={`grid max-h-full w-full grow grid-cols-3 justify-items-center gap-y-5 overflow-y-auto px-6 ${LTHEME.LIGHT}-scrollbar `}
							>
								<div className="col-span-1 flex h-max w-max flex-col items-center justify-center">
									<div className="h-2 w-full"></div>
									<div
										className={`flex h-max w-max cursor-pointer items-center justify-start p-1 transition-transform duration-300 ease-in-out hover:scale-110`}
										onClick={handleNewProfile}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											fill="none"
											viewBox="0 0 24 24"
											strokeWidth={0.5}
											stroke="currentColor"
											className="size-24 active:bg-neutral-100"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M12 4.5v15m7.5-7.5h-15"
											/>
										</svg>
									</div>
									<div
										className={`h-max w-max text-lg font-semibold`}
									>
										New Profile
									</div>
								</div>
								<div className="col-span-1 flex h-max w-full flex-col items-center justify-center">
									<div className="h-2 w-full"></div>
									<div
										className={`h-max w-max p-1 active:bg-neutral-100`}
										onClick={handleImportProfile}
									>
										<div
											className={`flex h-24 w-24 cursor-pointer items-center justify-center p-1 transition-transform duration-300 ease-in-out hover:scale-110`}
										>
											<LUIThemedIcon
												Icon={UploadSimpleIcon}
												weight="thin"
												className={`size-18`}
												passedTheme={LTHEME.LIGHT}
											/>
										</div>
									</div>
									<div
										className={`h-max w-full text-center text-lg font-semibold text-wrap break-words`}
									>
										Import Profile
									</div>
								</div>
								{userProfiles!.map((profile) => (
									<LUIProfileMini
										key={profile.userId}
										userProfile={profile}
										name={profile.name}
										changeExit={(exit) =>
											setExit(
												exit ?? exitTransitions.zoomIn,
											)
										}
									/>
								))}
							</div>
						</div>
					</div>

					<div className={`flex w-full justify-center pt-2 pb-2`}>
						<button
							className={`flex cursor-pointer content-center gap-x-2 rounded-md border border-black px-6 py-1 text-black transition-all duration-300 hover:gap-x-20 hover:px-2`}
							onClick={handleUseStorageProvider}
						>
							<span className="text-black">
								{llConfig.isEnabled
									? "Use Chrome"
									: "Use Little Local"}
							</span>
							<span className="flex items-center justify-center">
								<LUIThemedIcon
									Icon={ArrowRightIcon}
									className={`size-5`}
									color={"black"}
								/>
							</span>
						</button>
					</div>
					<input
						type="file"
						ref={fileInputRef}
						style={{ display: "none" }}
						onChange={handleFileInputChange}
					/>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIProfileMenu };
