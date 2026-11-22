import {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useSearchParams } from "react-router";
import { motion } from "framer-motion";
import {
	ClipboardTextIcon,
	FileIcon,
	FolderOpenIcon,
	XIcon,
} from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { staging } from "../../../storage/staging";
import { inToolbarPopup } from "../../ceremonyWindow";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { UIStateContext } from "../../contexts/UIStateContext";
import {
	asPickedFiles,
	parsePickRequest,
	pendingPickKey,
	pickKey,
	pickProblem,
	type PickedFile,
} from "../../filePick";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";

const sizeLabel = (bytes: number): string =>
	bytes >= 1024 * 1024
		? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
		: `${Math.max(1, Math.round(bytes / 1024))} KB`;

// The shared upload screen (filePick.ts). Other screens send the user
// here; files are pasted (or dropped), listed, and handed back when Upload
// is pressed. No system file window is opened: it would close the popup.
// Pasted files are staged at once and remembered, so the popup closing
// before Upload does not lose them.
const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const go = useMoveNavigate();
	const [params] = useSearchParams();
	const { getDraft, setDraft, clearDraft } = useContext(UIStateContext);
	const [problem, setProblem] = useState("");
	const [isWorking, setIsWorking] = useState(false);
	const workingRef = useRef(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isOver, setIsOver] = useState(false);
	// A system file dialog closes Chrome's toolbar popup, so browsing is
	// offered only when running outside the toolbar popup (side panel, tab).
	const [canBrowse] = useState(() => !inToolbarPopup());

	// What the asking screen needs; this screen only enforces it.
	const requestText = params.get("request");
	const rules = useMemo(() => parsePickRequest(requestText), [requestText]);
	const slot = params.get("slot") ?? "";
	// Only this extension's own routes.
	const returnParam = params.get("returnTo") ?? "";
	const returnTo = returnParam.startsWith("/") ? returnParam : "/";
	const pendingKey = pendingPickKey(slot);

	const [pending, setPending] = useState<Array<PickedFile>>(() =>
		asPickedFiles(getDraft(pendingKey)),
	);
	const remember = useCallback(
		(next: Array<PickedFile>) => {
			setPending(next);
			if (next.length === 0) {
				clearDraft(pendingKey);
			} else {
				setDraft(pendingKey, next);
			}
		},
		[pendingKey, setDraft, clearDraft],
	);

	const add = useCallback(
		async (files: Array<File>, source: "paste" | "drop" | "browse") => {
			if (!rules || slot === "" || workingRef.current) {
				return;
			}
			if (files.length === 0) {
				if (source === "browse") {
					return;
				}
				setProblem(
					source === "drop"
						? "No file was dropped. Drop a file here instead."
						: "There is no file on the clipboard. Copy one first.",
				);
				return;
			}
			workingRef.current = true;
			setIsWorking(true);
			const problems: Array<string> = [];
			let next = pending;
			try {
				for (const file of files) {
					const reason = pickProblem(rules, file);
					if (reason) {
						problems.push(`${file.name || "File"}: ${reason}`);
						continue;
					}
					const picked: PickedFile = {
						// Straight to disk: a large file is never all in
						// memory.
						file: await staging.putBlob(file),
						type: file.type,
						name: file.name || "Pasted file",
						size: file.size,
					};
					if (rules.maxFiles === 1) {
						// One is wanted: the newest replaces the last.
						await Promise.all(
							next.map((old) => staging.discard(old.file)),
						);
						next = [picked];
					} else if (next.length >= rules.maxFiles) {
						await staging.discard(picked.file);
						problems.push(
							`Only ${rules.maxFiles} files can be added at once.`,
						);
						break;
					} else {
						next = [...next, picked];
					}
				}
				remember(next);
				setProblem(problems.join(" "));
			} catch (error) {
				console.error("Could not take the file.", error);
				setProblem("That file couldn't be read. Try again.");
			} finally {
				workingRef.current = false;
				setIsWorking(false);
			}
		},
		[rules, slot, pending, remember],
	);

	// Pasting needs no system window, so it works in the toolbar popup.
	// Heard on the whole page, so it does not matter what has focus.
	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => {
			event.preventDefault();
			void add(Array.from(event.clipboardData?.files ?? []), "paste");
		};
		document.addEventListener("paste", onPaste);
		return () => document.removeEventListener("paste", onPaste);
	}, [add]);

	const remove = async (file: PickedFile) => {
		remember(pending.filter((item) => item.file !== file.file));
		await staging.discard(file.file);
	};

	const handleUpload = async () => {
		if (pending.length === 0) {
			return;
		}
		// Whatever was uploaded for this slot before is replaced.
		const previous = asPickedFiles(getDraft(pickKey(slot)));
		await Promise.all(previous.map((old) => staging.discard(old.file)));
		setDraft(pickKey(slot), pending);
		clearDraft(pendingKey);
		// Back into the page that asked, the way it came out.
		go(returnTo, "into", { replace: true });
	};

	const isDark = theme === LTHEME.DARK;
	const text = isDark ? "text-white" : "text-black";
	const muted = isDark ? "text-neutral-300" : "text-neutral-600";

	if (!rules || slot === "") {
		return (
			<div
				className={`flex h-full w-full flex-col ${isDark ? "bg-black" : "bg-white"}`}
			>
				<LUIBasicNav navigateTo={returnTo} move="into" />
				<p role="alert" className={`px-8 pt-10 text-center ${text}`}>
					Nothing was asked for here.
				</p>
			</div>
		);
	}
	return (
		<motion.div
			className={`flex h-full w-full flex-col select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo={returnTo} move="into" />
			<div className="flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-hidden">
				<h1
					className={`mt-2 flex items-center justify-center text-2xl font-semibold tracking-tight ${text}`}
				>
					{rules.title}
				</h1>
				<div
					className={`flex w-full grow flex-col items-center gap-y-5 overflow-y-auto px-6 pt-5 pb-1 ${theme}-scrollbar`}
				>
					<p className={`text-center text-sm ${muted}`}>
						{rules.accepts}
						{rules.maxFiles > 1
							? `. Up to ${rules.maxFiles} files.`
							: ""}
					</p>

					{canBrowse ? (
						<input
							ref={fileInputRef}
							type="file"
							className="hidden"
							accept={
								rules.types ? rules.types.join(",") : undefined
							}
							multiple={rules.maxFiles > 1}
							onChange={(event) => {
								const chosen = Array.from(
									event.target.files ?? [],
								);
								event.target.value = "";
								void add(chosen, "browse");
							}}
						/>
					) : null}

					<div
						role="region"
						tabIndex={0}
						aria-label={`${rules.pasteHint}, or drop files here`}
						data-testid="upload-area"
						className={`flex w-full max-w-sm grow flex-col items-center gap-y-2 rounded-2xl border border-dashed px-4 py-5 transition-colors ${
							isOver
								? isDark
									? "border-white bg-neutral-900"
									: "border-black bg-neutral-100"
								: isDark
									? "border-neutral-700 bg-neutral-900/40"
									: "border-neutral-300 bg-neutral-100/50"
						}`}
						onDragOver={(event) => {
							event.preventDefault();
							setIsOver(true);
						}}
						onDragLeave={(event) => {
							if (
								!event.currentTarget.contains(
									event.relatedTarget as Node | null,
								)
							) {
								setIsOver(false);
							}
						}}
						onDrop={(event) => {
							event.preventDefault();
							setIsOver(false);
							void add(
								Array.from(event.dataTransfer.files),
								"drop",
							);
						}}
					>
						{pending.length === 0 ? (
							<div className="flex grow flex-col items-center justify-center gap-y-2 text-center">
								<LUIThemedIcon
									Icon={ClipboardTextIcon}
									weight="regular"
									className="size-10 opacity-75"
								/>
								<p className={`text-sm font-semibold ${text}`}>
									{rules.pasteHint}
								</p>
								<p className={`text-xs ${muted}`}>
									{canBrowse
										? "You can also drop files here or browse from your computer."
										: "You can also drop files onto this box."}
								</p>
								{canBrowse ? (
									<button
										type="button"
										disabled={isWorking}
										onClick={() =>
											fileInputRef.current?.click()
										}
										className={`mt-1 flex cursor-pointer items-center gap-x-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
											isDark
												? "border-neutral-700 bg-neutral-900 text-neutral-100 hover:bg-neutral-800"
												: "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100"
										}`}
									>
										<LUIThemedIcon
											Icon={FolderOpenIcon}
											weight="regular"
											className="size-4"
										/>
										Browse files
									</button>
								) : null}
							</div>
						) : (
							<>
								<ul className="flex w-full flex-col gap-y-1.5">
									{pending.map((file) => (
										<li
											key={file.file}
											className={`flex h-10 w-full items-center gap-x-2 rounded-xl border px-2.5 ${
												isDark
													? "border-neutral-800 bg-neutral-900"
													: "border-neutral-200 bg-white"
											}`}
										>
											<LUIThemedIcon
												Icon={FileIcon}
												weight="regular"
												className="size-4 shrink-0"
											/>
											<span
												className={`min-w-0 grow truncate text-xs font-medium ${text}`}
											>
												{file.name}
											</span>
											<span
												className={`shrink-0 text-xs ${muted}`}
											>
												{sizeLabel(file.size)}
											</span>
											<button
												type="button"
												aria-label={`Remove ${file.name}`}
												className={`flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${isDark ? "hover:bg-neutral-800" : "hover:bg-neutral-200"}`}
												onClick={() =>
													void remove(file)
												}
											>
												<LUIThemedIcon
													Icon={XIcon}
													weight="regular"
													className="size-3.5"
												/>
											</button>
										</li>
									))}
								</ul>
								{canBrowse ? (
									<button
										type="button"
										disabled={isWorking}
										onClick={() =>
											fileInputRef.current?.click()
										}
										className={`mt-auto flex cursor-pointer items-center gap-x-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
											isDark
												? "border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 hover:text-white"
												: "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 hover:text-black"
										}`}
									>
										<LUIThemedIcon
											Icon={FolderOpenIcon}
											weight="regular"
											className="size-3.5"
										/>
										{rules.maxFiles === 1
											? "Replace file"
											: "Browse more files"}
									</button>
								) : null}
							</>
						)}
					</div>

					{problem !== "" ? (
						<LUINote warning>{problem}</LUINote>
					) : null}

					<div className="flex h-12 w-full shrink-0 items-center justify-center">
						<LUICUButton
							name={isWorking ? "Reading…" : "Upload"}
							onClick={handleUpload}
							passedTheme={theme}
							disabled={isWorking || pending.length === 0}
						/>
					</div>
				</div>
			</div>
		</motion.div>
	);
};

export { Page as LUIFileInput };
