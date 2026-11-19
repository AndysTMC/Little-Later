import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { LEXPORT_TYPE, LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { motion } from "framer-motion";
import { useState } from "react";
import { exportBackup, exportReadable } from "../../../services/backup";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISelectT2 } from "../../components/LUISelectT2/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { createToast } from "../../../services/toasts";

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const ExportTypes = Object.values(LEXPORT_TYPE);
	const [exportType, setExportType] = useState<LEXPORT_TYPE>(
		LEXPORT_TYPE.IMPORTABLE,
	);
	const [backupPassword, setBackupPassword] = useState("");
	// The button blocks a second press while this runs.
	const handleExport = async () => {
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
		}
	};
	return (
		<motion.div
			className={`flex h-full w-full flex-col select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} overflow-y-hidden`}
			{...pageMotion}
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
					<div className="flex w-full justify-center pt-2">
						<LUICUButton
							name="Export"
							disabled={
								exportType === LEXPORT_TYPE.IMPORTABLE &&
								backupPassword.trim() === ""
							}
							onClick={handleExport}
						/>
					</div>
				</div>
			</LUISettingsLayout>
		</motion.div>
	);
};

export { Page as LUIExport };
