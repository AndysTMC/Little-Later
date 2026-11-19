import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { UploadSimpleIcon } from "@phosphor-icons/react";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIProfileMini } from "../../components/LUIProfileMini/Component";
import { useUserProfiles } from "../../hooks/useUserProfiles";
import { LUILoading } from "../../components/LUILoading/Component";
import { useLoading } from "../../hooks/useLoading";

const Page = () => {
	const pageMotion = usePageMotion();
	const go = useMoveNavigate();

	const userProfiles = useUserProfiles();

	const loading = useLoading([userProfiles]);

	const handleNewProfile = () => {
		go("/new-profile", "forward");
	};

	const handleImportProfile = () => {
		go("/import-profile", "forward");
	};

	return (
		<motion.div
			className={`flex h-full w-full flex-col bg-white select-none`}
			{...pageMotion}
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
						<h1
							className={`mt-5 flex items-center justify-center text-4xl font-semibold text-black`}
						>
							Choose Profile
						</h1>
						<div className="w-full grow overflow-y-hidden px-10 pt-5 pb-1">
							<div
								className={`grid max-h-full w-full grow grid-cols-3 justify-items-center gap-y-5 overflow-y-auto px-6 ${LTHEME.LIGHT}-scrollbar `}
							>
								<div className="col-span-1 flex h-max w-max flex-col items-center justify-center">
									<div className="h-2 w-full"></div>
									<button
										type="button"
										aria-label="Create a new profile"
										className={`flex h-max w-max cursor-pointer items-center justify-start bg-transparent p-1 transition-transform duration-300 ease-in-out hover:scale-110`}
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
									</button>
									<div
										className={`h-max w-max text-lg font-semibold`}
									>
										New Profile
									</div>
								</div>
								<div className="col-span-1 flex h-max w-full flex-col items-center justify-center">
									<div className="h-2 w-full"></div>
									<button
										type="button"
										aria-label="Import a profile"
										className={`h-max w-max bg-transparent p-1 active:bg-neutral-100`}
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
									</button>
									<div
										className={`h-max w-full text-center text-lg font-semibold text-wrap break-words`}
									>
										Import Profile
									</div>
								</div>
								{userProfiles!.map((profile) => (
									<LUIProfileMini
										key={profile.id}
										userProfile={profile}
										name={profile.name}
									/>
								))}
							</div>
						</div>
					</div>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIProfileMenu };
