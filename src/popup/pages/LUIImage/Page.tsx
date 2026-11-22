import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useParams } from "react-router";
import { ImageIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import {
	useImages,
	useNotes,
	useReminders,
	useSaves,
	useTasks,
} from "../../hooks/useRecords";
import { useImageBlob } from "../../hooks/useImageBlob";
import { useObjectUrl } from "../../hooks/useObjectUrl";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIFeaturePageUD } from "../../components/LUIFeaturePageUD/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { LUITagInput } from "../../components/LUITagInput/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { LUIPillButton } from "../../components/LUIPillButton/Component";
import { LUIDeleteButton } from "../../components/LUIDeleteButton/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";
import { attempt } from "../../attempt";
import { send } from "../../../utils/send";
import { saveFile } from "../../../utils/saveFile";
import { collectProfileTags } from "../../../utils/tags";
import type { ImageRecord } from "../../../storage/repositories";

const openExternalUrl = (url: string) => {
	if (typeof chrome !== "undefined" && chrome.tabs?.create) {
		void chrome.tabs.create({ url });
	} else {
		window.open(url, "_blank", "noopener,noreferrer");
	}
};

const MAX_TITLE_LENGTH = 120;

const sameTags = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
	a.length === b.length && a.every((tag, index) => tag === b[index]);

const extensionForMime = (mimeType: string): string => {
	switch (mimeType) {
		case "image/png":
			return "png";
		case "image/webp":
			return "webp";
		case "image/gif":
			return "gif";
		case "image/avif":
			return "avif";
		default:
			return "jpg";
	}
};

const ImageDetail = ({
	image,
	tagSuggestions,
}: {
	image: ImageRecord;
	tagSuggestions: ReadonlyArray<string>;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const go = useMoveNavigate();
	const blob = useImageBlob(image.id, image.mimeType);
	const objectUrl = useObjectUrl(blob);
	const [title, setTitle] = useState(image.title);
	const [tags, setTags] = useState<Array<string>>(() => [
		...(image.tags ?? []),
	]);

	const trimmedTitle = title.trim();
	const hasChanges =
		trimmedTitle !== image.title || !sameTags(tags, image.tags ?? []);

	const handleUpdate = async () => {
		if (trimmedTitle === "" || !hasChanges) return;
		await attempt(
			() =>
				send("image.update", {
					id: image.id,
					title: trimmedTitle,
					tags,
				}),
			"Couldn't update this image.",
		);
	};

	const handleDownload = async () => {
		if (!blob) return;
		const safeName =
			(trimmedTitle || "image").replace(/[^a-z0-9-_ ]/gi, "").trim() ||
			"image";
		await saveFile(blob, `${safeName}.${extensionForMime(image.mimeType)}`);
	};

	const handleDelete = async () => {
		await send("image.delete", { id: image.id });
		go("/home", "back", { replace: true });
	};

	return (
		<div className="flex min-h-0 w-full grow flex-col overflow-y-hidden">
			<LUIFeaturePageUD Icon={ImageIcon} title="Image" />
			<div
				className={`w-full grow overflow-y-auto px-4 py-3 ${theme}-scrollbar`}
			>
				<div className="mx-auto flex w-full max-w-2xl flex-col gap-y-3">
					<div
						className={`flex max-h-72 w-full items-center justify-center overflow-hidden rounded-2xl border p-2 ${
							isDark
								? "border-neutral-800 bg-neutral-950"
								: "border-neutral-200 bg-neutral-100"
						}`}
					>
						{objectUrl ? (
							<img
								src={objectUrl}
								alt={image.title}
								className="max-h-64 w-auto rounded-xl object-contain"
							/>
						) : (
							<div className="py-12 text-xs opacity-60">
								Loading image…
							</div>
						)}
					</div>

					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="flex flex-wrap items-center gap-1.5">
							<LUIPillButton
								label="Download"
								disabled={!blob}
								onClick={() => void handleDownload()}
							/>
							{image.sourceUrl ? (
								<LUIPillButton
									label="Open source"
									onClick={() =>
										openExternalUrl(image.sourceUrl!)
									}
								/>
							) : null}
						</div>
						<LUIDeleteButton
							subject="image"
							onDelete={handleDelete}
							failureMessage="Couldn't delete this image."
						/>
					</div>

					<LUITextInputT1
						name="Title"
						passedValue={title}
						onChange={setTitle}
						validate={(value) =>
							value.trim() === ""
								? {
										success: false,
										error: "Title cannot be empty",
									}
								: value.length > MAX_TITLE_LENGTH
									? {
											success: false,
											error: "Title is too long",
										}
									: { success: true, error: "" }
						}
						lengthLimit={MAX_TITLE_LENGTH}
					/>

					<LUITagInput
						tags={tags}
						onChange={setTags}
						suggestions={tagSuggestions}
					/>
				</div>
			</div>
			<div className="flex h-16 w-full shrink-0 items-center justify-center px-4 pt-1 pb-2">
				<LUICUButton
					name="Update"
					onClick={handleUpdate}
					passedTheme={theme}
					disabled={trimmedTitle === "" || !hasChanges}
				/>
			</div>
		</div>
	);
};

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const { id } = useParams();
	const images = useImages();
	const pages = useSaves();
	const notes = useNotes();
	const tasks = useTasks();
	const reminders = useReminders();
	const loading = useLoading([id, images, pages, notes, tasks, reminders]);
	const image = images?.find((item) => item.id === id);

	const tagSuggestions = useMemo(
		() =>
			collectProfileTags([
				(pages ?? []).filter((page) => page.saved),
				tasks ?? [],
				reminders ?? [],
				notes ?? [],
				images ?? [],
			]),
		[pages, tasks, reminders, notes, images],
	);

	return (
		<motion.div
			className={`h-full w-full overflow-y-hidden select-none ${
				theme === LTHEME.DARK ? "bg-black" : "bg-white"
			}`}
			{...pageMotion}
		>
			{loading ? (
				<LUILoading />
			) : (
				<motion.div
					className="flex h-full min-h-0 w-full flex-col overflow-y-hidden"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
				>
					<LUIBasicNav navigateTo="/home" />
					{image ? (
						<ImageDetail
							key={image.id}
							image={image}
							tagSuggestions={tagSuggestions}
						/>
					) : (
						<LUIEmptyState title="Image not found." />
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIImage };
