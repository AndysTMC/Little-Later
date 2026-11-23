import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { LEXPORT_TYPE, LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { capitalize } from "little-shared/utils/misc";
import { motion } from "framer-motion";
import { useState } from "react";
import { exportBackup, exportReadable } from "../../../services/backup";
import {
	exportBookmarksHtml,
	exportCalendarIcs,
	exportObsidianMarkdown,
} from "../../../services/portable";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUISettingSelect } from "../../components/LUISettingRow/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { createToast } from "../../../services/toasts";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import { send } from "../../../utils/send";

type ExportFormat = LEXPORT_TYPE | "markdown" | "calendar" | "bookmarks";

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const userSettings = useCurrentUserSettings();
	const exportOptions: ReadonlyArray<{ value: ExportFormat; label: string }> =
		[
			...Object.values(LEXPORT_TYPE).map((value) => ({
				value: value as ExportFormat,
				label: capitalize(value),
			})),
			{ value: "markdown", label: "Markdown (Obsidian)" },
			{ value: "calendar", label: "Calendar (.ics)" },
			{ value: "bookmarks", label: "Bookmarks (.html)" },
		];
	const [exportType, setExportType] = useState<ExportFormat>(
		LEXPORT_TYPE.IMPORTABLE,
	);
	const [backupPassword, setBackupPassword] = useState("");
	// The button blocks a second press while this runs.
	const handleExport = async () => {
		try {
			if (exportType === LEXPORT_TYPE.IMPORTABLE) {
				await exportBackup(backupPassword);
				if (userSettings) {
					void send("settings.update", {
						misc: {
							...userSettings.misc,
							lastBackupAt: Date.now(),
						},
					}).catch(() => undefined);
				}
			} else if (exportType === LEXPORT_TYPE.READABLE) {
				await exportReadable();
			} else if (exportType === "markdown") {
				await exportObsidianMarkdown();
			} else if (exportType === "calendar") {
				await exportCalendarIcs();
			} else {
				await exportBookmarksHtml();
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
				<div className={`relative flex h-max w-full flex-col gap-y-2`}>
					<div className="relative z-40">
						<LUISettingSelect
							label="Choose Export Format"
							value={exportType}
							options={exportOptions}
							onChange={setExportType}
						/>
					</div>
					{exportType === LEXPORT_TYPE.IMPORTABLE ? (
						<>
							<LUINote className="w-full">
								Choose a password for this backup; you can use
								this profile's password. Importing the backup
								needs it, and the imported profile opens with
								it.
							</LUINote>
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
					) : exportType === "markdown" ? (
						<LUINote className="w-full">
							Exports unlocked notes and saves with YAML
							frontmatter and #tags for Obsidian or Markdown
							tools. Locked notes and API keys are excluded.
						</LUINote>
					) : exportType === "calendar" ? (
						<LUINote className="w-full">
							Exports due/recurring tasks and reminders as an
							iCalendar (.ics) file for Google Calendar, Apple
							Calendar, or Thunderbird.
						</LUINote>
					) : exportType === "bookmarks" ? (
						<LUINote className="w-full">
							Exports saved pages in standard Netscape Bookmark
							HTML format with tags for browsers, Raindrop, or
							Pocket.
						</LUINote>
					) : (
						<LUINote className="w-full">
							Readable exports are plaintext and omit your AI API
							key.
						</LUINote>
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
