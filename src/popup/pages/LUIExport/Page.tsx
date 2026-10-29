import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useTheme } from "../../hooks/useTheme";
import { exitTransitions } from "../../../route-transitions";
import { LEXPORT_TYPE, LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { motion } from "framer-motion";
import { useState } from "react";
import { exportBackup, exportReadable } from "../../../services/backup";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISelectT2 } from "../../components/LUISelectT2/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { createToast } from "../../../services/toasts";

const Page = () => {
	const { theme } = useTheme();
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});
	const ExportTypes = Object.values(LEXPORT_TYPE);
	const [exportType, setExportType] = useState<LEXPORT_TYPE>(
		LEXPORT_TYPE.IMPORTABLE,
	);
	const [backupPassword, setBackupPassword] = useState("");
	const [isExporting, setIsExporting] = useState(false);
	const handleExport = async () => {
		if (isExporting) {
			return;
		}
		setIsExporting(true);
		try {
			if (exportType === LEXPORT_TYPE.IMPORTABLE) {
				await exportBackup(backupPassword);
			} else {
				await exportReadable();
			}
			await createToast("Export started.", LTOAST_TYPE.SUCCESS);
		} catch (error) {
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't export your data.",
				LTOAST_TYPE.ERROR,
			);
		} finally {
			setIsExporting(false);
		}
	};
	return (
		<motion.div
			className={`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-hidden`}
			{...entry}
			{...exit}
		>
			<LUIBasicNav navigateTo="/settings" />
			<LUISettingsLayout pageName="Export">
				<div className={`relative h-max w-full`}>
					<div
						className={`relative z-40 flex h-max w-full items-center justify-between py-2`}
					>
						<div
							className={`h-auto w-max text-lg ${
								theme === LTHEME.DARK
									? "text-white"
									: "text-black"
							} `}
						>
							Choose Export Format
						</div>
						<LUISelectT2
							options={ExportTypes}
							currentOption={exportType}
							onOptionChange={setExportType}
						/>
					</div>
					{exportType === LEXPORT_TYPE.IMPORTABLE ? (
						<>
							<div
								className={`mb-1 text-sm ${
									theme === LTHEME.DARK
										? "text-neutral-300"
										: "text-neutral-600"
								}`}
							>
								Choose a password for this backup; you can use
								this profile's password. Importing the backup
								needs it, and the imported profile opens with
								it.
							</div>
							<LUITextInputT1
								name="Backup password"
								inputType="password"
								passedValue={backupPassword}
								onChange={setBackupPassword}
								lengthLimit={128}
								disableLengthCounter
								validate={(value) =>
									value.trim() === ""
										? {
												success: false,
												error: "Password required",
											}
										: { success: true, error: "" }
								}
							/>
						</>
					) : (
						<div
							className={`mb-2 text-sm ${
								theme === LTHEME.DARK
									? "text-neutral-300"
									: "text-neutral-600"
							}`}
						>
							Readable exports are plaintext and omit your AI API
							key.
						</div>
					)}
					<div className={`h-max w-full`}>
						<button
							type="button"
							disabled={
								isExporting ||
								(exportType === LEXPORT_TYPE.IMPORTABLE &&
									backupPassword.trim() === "")
							}
							className={`h-max w-max text-base ${
								theme === LTHEME.DARK
									? "bg-white text-black"
									: "bg-black text-white"
							} cursor-pointer rounded-full px-6 py-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60`}
							onClick={handleExport}
						>
							{isExporting ? "Exporting..." : "Export"}
						</button>
					</div>
				</div>
			</LUISettingsLayout>
		</motion.div>
	);
};

export { Page as LUIExport };
