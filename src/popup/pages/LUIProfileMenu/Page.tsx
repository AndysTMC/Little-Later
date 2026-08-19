import { useNavigate } from "react-router";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import React, { useRef, useState } from "react";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { PasswordIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { LUIIconField } from "../../components/LUIIconField/Component";
import { importData } from "../../../services/dataExchange";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIProfileMini } from "../../components/LUIProfileMini/Component";
import { useUserProfiles } from "../../hooks/useUserProfiles";
import { LUILoading } from "../../components/LUILoading/Component";
import { useLoading } from "../../hooks/useLoading";
import { createToast } from "../../../services/toasts";

const Page = () => {
	const { entry, exit, setExit } = useLittleTransition({});
	const navigate = useNavigate();

	const userProfiles = useUserProfiles();

	const loading = useLoading([userProfiles]);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [pendingImport, setPendingImport] = useState<Blob | null>(null);
	const [importPassword, setImportPassword] = useState("");
	const [isImporting, setIsImporting] = useState(false);

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
		setPendingImport(e.target.files[0]);
		setImportPassword("");
		e.target.value = "";
	};

	const handleConfirmImport = async () => {
		if (!pendingImport || isImporting) {
			return;
		}
		setIsImporting(true);
		try {
			await importData(pendingImport, importPassword);
			setPendingImport(null);
			setImportPassword("");
			await createToast(
				"Profile imported. Unlock it to continue.",
				LTOAST_TYPE.SUCCESS,
			);
		} catch (error) {
			console.error("Failed to import profile.", error);
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't import that file.",
				LTOAST_TYPE.ERROR,
			);
		} finally {
			setIsImporting(false);
		}
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

					{pendingImport ? (
						<div className="flex w-full flex-col items-center gap-y-2 px-10 pb-4">
							<LUIIconField
								id="little-import-password"
								icon={PasswordIcon}
								placeholder="Password"
								ariaLabel="Backup password"
								type="password"
								autoComplete="off"
								value={importPassword}
								onChange={setImportPassword}
								onSubmit={() => {
									void handleConfirmImport();
								}}
								passedTheme={LTHEME.LIGHT}
							/>
							<div className="flex gap-x-2">
								<button
									type="button"
									disabled={
										isImporting ||
										importPassword.trim() === ""
									}
									className="flex h-10 cursor-pointer items-center justify-center rounded-lg bg-black px-4 text-white disabled:cursor-not-allowed disabled:opacity-60"
									onClick={handleConfirmImport}
								>
									{isImporting ? "Importing..." : "Import"}
								</button>
								<button
									type="button"
									disabled={isImporting}
									className="flex h-10 cursor-pointer items-center justify-center rounded-lg bg-neutral-200 px-4 text-black disabled:cursor-not-allowed disabled:opacity-60"
									onClick={() => {
										setPendingImport(null);
										setImportPassword("");
									}}
								>
									Cancel
								</button>
							</div>
						</div>
					) : null}

					<input
						type="file"
						accept=".lldat,application/octet-stream"
						aria-label="Import profile file"
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
