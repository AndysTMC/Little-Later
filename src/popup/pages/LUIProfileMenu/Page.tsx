import { LTHEME } from "little-shared/enums";
import { motion } from "framer-motion";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { PlusIcon, UploadSimpleIcon } from "@phosphor-icons/react";
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
							className={`mt-2 flex items-center justify-center text-2xl font-semibold tracking-tight text-black`}
						>
							Choose profile
						</h1>
						<div className="mx-auto w-full max-w-2xl grow overflow-y-hidden px-4 pt-3 pb-1">
							<div
								className={`grid max-h-full w-full grow grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] justify-items-center gap-x-3 gap-y-5 overflow-y-auto px-2 py-2 ${LTHEME.LIGHT}-scrollbar`}
							>
								<div className="col-span-1 flex h-max w-full flex-col items-center justify-center gap-y-2">
									<button
										type="button"
										aria-label="Create a new profile"
										className="flex size-24 cursor-pointer items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-800 transition-all duration-150 hover:border-neutral-400 hover:bg-neutral-200/80 hover:shadow-md hover:ring-4 hover:ring-neutral-900/10 active:scale-[0.97]"
										onClick={handleNewProfile}
									>
										<LUIThemedIcon
											Icon={PlusIcon}
											weight="regular"
											className="size-10"
											passedTheme={LTHEME.LIGHT}
										/>
									</button>
									<div className="h-max w-full text-center text-sm font-medium text-neutral-900">
										New profile
									</div>
								</div>
								<div className="col-span-1 flex h-max w-full flex-col items-center justify-center gap-y-2">
									<button
										type="button"
										aria-label="Import a profile"
										className="flex size-24 cursor-pointer items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-800 transition-all duration-150 hover:border-neutral-400 hover:bg-neutral-200/80 hover:shadow-md hover:ring-4 hover:ring-neutral-900/10 active:scale-[0.97]"
										onClick={handleImportProfile}
									>
										<LUIThemedIcon
											Icon={UploadSimpleIcon}
											weight="regular"
											className="size-9"
											passedTheme={LTHEME.LIGHT}
										/>
									</button>
									<div className="h-max w-full text-center text-sm font-medium break-words text-neutral-900">
										Import profile
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
