import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
	FileIcon,
	PasswordIcon,
	UploadSimpleIcon,
} from "@phosphor-icons/react";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { importBackup } from "../../../services/backup";
import { createToast } from "../../../services/toasts";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { LUIIconField } from "../../components/LUIIconField/Component";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { pickRoute, type PickRequest } from "../../filePick";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { usePickedFile } from "../../hooks/usePickedFile";

const BACKUP_SLOT = "backup.import";

// What this page needs from the upload screen: one or more backups. Their
// content is checked when they are imported, so any type is taken.
const BACKUP_REQUEST: PickRequest = {
	title: "Upload backups",
	accepts: "Little Later backup files (.lldat)",
	types: null,
	// Any backup Little Later wrote: files are staged, read and imported a
	// chunk at a time, so their size is limited only by browser storage.
	maxBytes: Number.MAX_SAFE_INTEGER,
	maxFiles: 10,
	pasteHint: "Copy backup files in your file manager, then press Ctrl+V",
};

// Imports backups as new profiles: the files come from the shared upload
// screen, the password is typed here. Shown while locked, so it is light
// like the profile picker.
const Page = () => {
	const pageMotion = usePageMotion();
	const go = useMoveNavigate();
	const picked = usePickedFile(BACKUP_SLOT);
	const [password, setPassword] = useState("");
	const [warning, setWarning] = useState("");
	// One import at a time, from the button or from Enter in the field.
	const importing = useRef(false);
	const [isImporting, setIsImporting] = useState(false);

	const handleChoose = () => {
		go(pickRoute(BACKUP_REQUEST, BACKUP_SLOT, "/import-profile"), "outOf");
	};

	const handleImport = async () => {
		if (importing.current || picked.files.length === 0 || password === "") {
			return;
		}
		importing.current = true;
		setIsImporting(true);
		setWarning("");
		const imported: Array<string> = [];
		const failed: Array<string> = [];
		let skippedLinks = 0;
		try {
			for (const file of picked.files) {
				try {
					const result = await importBackup(file.blob, password);
					skippedLinks += result.skippedLinks;
					imported.push(file.name);
					// Gone from the list at once: a retry of the files that
					// failed must not import this one a second time.
					await picked.remove(file.id);
				} catch (error) {
					console.error("Failed to import a profile.", error);
					failed.push(
						`${file.name}: ${error instanceof Error ? error.message : "couldn't be imported."}`,
					);
				}
			}
		} finally {
			importing.current = false;
			setIsImporting(false);
		}
		if (imported.length > 0) {
			await createToast(
				(imported.length === 1
					? `${imported[0]} imported. Unlock it with the backup's password.`
					: `${imported.length} profiles imported. Unlock them with the backup's password.`) +
					(skippedLinks > 0
						? ` ${skippedLinks} link${skippedLinks === 1 ? "" : "s"} to records missing from the backup ${skippedLinks === 1 ? "was" : "were"} left out.`
						: ""),
				LTOAST_TYPE.SUCCESS,
			);
		}
		if (failed.length > 0) {
			// Only the files that failed stay, so another password can be
			// tried on them.
			setWarning(failed.join(" "));
			return;
		}
		setPassword("");
		go("/browse-profiles", "back", { replace: true });
	};

	return (
		<motion.div
			className="flex h-full w-full flex-col bg-white select-none"
			{...pageMotion}
		>
			<LUIBasicNav
				navigateTo="/browse-profiles"
				passedTheme={LTHEME.LIGHT}
			/>
			<div className="flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-hidden">
				<h1 className="mt-5 flex items-center justify-center text-4xl font-semibold text-black">
					Import Profile
				</h1>
				<div className="flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-auto px-12 pt-5 pb-1">
					<button
						type="button"
						aria-label={
							picked.files.length === 0
								? "Upload a backup file"
								: "Change the backup files"
						}
						className="flex min-h-24 w-72 cursor-pointer flex-col items-center justify-center gap-y-1 rounded-lg border border-dashed border-neutral-300 bg-neutral-100 px-4 py-3 hover:bg-neutral-200"
						onClick={handleChoose}
					>
						{picked.files.length === 0 ? (
							<>
								<LUIThemedIcon
									Icon={UploadSimpleIcon}
									weight="light"
									className="size-8"
									passedTheme={LTHEME.LIGHT}
								/>
								<span className="text-base font-semibold text-black">
									Upload
								</span>
								<span className="text-sm text-neutral-600">
									A Little Later backup file (.lldat)
								</span>
							</>
						) : (
							picked.files.map((file) => (
								<span
									key={file.name + file.size}
									className="flex w-full items-center gap-x-2 text-left"
								>
									<LUIThemedIcon
										Icon={FileIcon}
										weight="light"
										className="size-5 shrink-0"
										passedTheme={LTHEME.LIGHT}
									/>
									<span className="min-w-0 grow truncate text-sm text-black">
										{file.name}
									</span>
									<span className="shrink-0 text-xs text-neutral-600">
										{Math.max(
											1,
											Math.round(file.size / 1024),
										)}{" "}
										KB
									</span>
								</span>
							))
						)}
					</button>
					<LUIIconField
						id="little-import-password"
						icon={PasswordIcon}
						placeholder="Backup password"
						ariaLabel="Backup password"
						type="password"
						autoComplete="off"
						value={password}
						onChange={(value) => {
							setPassword(value);
							setWarning("");
						}}
						onSubmit={() => void handleImport()}
						passedTheme={LTHEME.LIGHT}
					/>
					{warning !== "" ? (
						<p
							role="alert"
							className="w-72 text-sm font-semibold text-red-700"
						>
							{warning}
						</p>
					) : (
						<p className="w-72 text-sm text-neutral-600 italic">
							The imported profile opens with the backup's
							password.
						</p>
					)}
					<div className="flex h-12 w-full items-center justify-center">
						<LUICUButton
							name="Import"
							onClick={handleImport}
							passedTheme={LTHEME.LIGHT}
							disabled={
								isImporting ||
								picked.files.length === 0 ||
								password === ""
							}
						/>
					</div>
				</div>
			</div>
		</motion.div>
	);
};

export { Page as LUIImportProfile };
