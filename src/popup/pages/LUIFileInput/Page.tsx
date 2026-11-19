import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { ClipboardTextIcon, FileIcon, XIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { staging } from "../../../storage/staging";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
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
	const [isOver, setIsOver] = useState(false);

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
		async (files: Array<File>) => {
			if (!rules || slot === "" || isWorking) {
				return;
			}
			if (files.length === 0) {
				setProblem(
					"There is no file on the clipboard. Copy one first.",
				);
				return;
			}
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
				setIsWorking(false);
			}
		},
		[rules, slot, isWorking, pending, remember],
	);

	// Pasting needs no system window, so it works in the toolbar popup.
	// Heard on the whole page, so it does not matter what has focus.
	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => {
			event.preventDefault();
			void add(Array.from(event.clipboardData?.files ?? []));
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
					className={`mt-5 flex items-center justify-center text-4xl font-semibold ${text}`}
				>
					{rules.title}
				</h1>
				<div className="flex w-full grow flex-col items-center gap-y-5 overflow-y-auto px-12 pt-5 pb-1">
					<p className={`text-center text-sm ${muted}`}>
						{rules.accepts}
						{rules.maxFiles > 1
							? `. Up to ${rules.maxFiles} files.`
							: ""}
					</p>

					<div
						tabIndex={0}
						aria-label={`${rules.pasteHint}, or drop files here`}
						data-testid="upload-area"
						className={`flex w-72 grow flex-col items-center gap-y-2 rounded-lg border border-dashed px-4 py-4 ${
							isOver
								? isDark
									? "border-white bg-neutral-900"
									: "border-black bg-neutral-100"
								: isDark
									? "border-neutral-700"
									: "border-neutral-300"
						}`}
						onDragOver={(event) => {
							event.preventDefault();
							setIsOver(true);
						}}
						onDragLeave={() => setIsOver(false)}
						onDrop={(event) => {
							event.preventDefault();
							setIsOver(false);
							void add(Array.from(event.dataTransfer.files));
						}}
					>
						{pending.length === 0 ? (
							<div className="flex grow flex-col items-center justify-center gap-y-2 text-center">
								<LUIThemedIcon
									Icon={ClipboardTextIcon}
									weight="light"
									className="size-12"
								/>
								<p
									className={`text-base font-semibold ${text}`}
								>
									{rules.pasteHint}
								</p>
								<p className={`text-sm ${muted}`}>
									You can also drop files onto this box.
								</p>
							</div>
						) : (
							<ul className="flex w-full flex-col gap-y-1">
								{pending.map((file) => (
									<li
										key={file.file}
										className={`flex h-10 w-full items-center gap-x-2 rounded-lg px-2 ${isDark ? "bg-neutral-900" : "bg-neutral-100"}`}
									>
										<LUIThemedIcon
											Icon={FileIcon}
											weight="light"
											className="size-5 shrink-0"
										/>
										<span
											className={`min-w-0 grow truncate text-sm ${text}`}
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
											className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full ${isDark ? "hover:bg-neutral-800" : "hover:bg-neutral-200"}`}
											onClick={() => void remove(file)}
										>
											<LUIThemedIcon
												Icon={XIcon}
												className="size-4"
											/>
										</button>
									</li>
								))}
							</ul>
						)}
					</div>

					{problem !== "" ? (
						<p
							role="alert"
							className={`w-72 text-center text-sm font-semibold ${isDark ? "text-red-400" : "text-red-700"}`}
						>
							{problem}
						</p>
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
