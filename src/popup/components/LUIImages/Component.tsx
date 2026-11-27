import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImageIcon, PlusIcon } from "@phosphor-icons/react";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import type { ImageRecord } from "../../../storage/repositories";
import { sessionStore, toBase64 } from "../../../storage/session";
import {
	ALLOWED_IMAGE_MIME_TYPES,
	MAX_IMAGE_BYTES,
} from "../../../background/commands/images";
import { send, type SendOptions } from "../../../utils/send";
import { createToast } from "../../../services/toasts";
import { getNoteCardTimeLabel } from "../../../utils/notePreview";
import { pickRoute, type PickRequest } from "../../filePick";
import { useTheme } from "../../hooks/useTheme";
import { useMoveNavigate } from "../../hooks/usePageMove";
import { useImageBlob } from "../../hooks/useImageBlob";
import { useObjectUrl } from "../../hooks/useObjectUrl";
import { usePickedFile } from "../../hooks/usePickedFile";
import { pressable } from "../../a11y";
import { LUIEmptyState } from "../LUIEmptyState/Component";
import { LUIDeleteButton } from "../LUIDeleteButton/Component";
import { LUITagChips } from "../LUITagChips/Component";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";
import { usePagination } from "../../hooks/usePagination";
import { LUIPagination } from "../LUIPagination/Component";

const IMAGE_SLOT = "images.upload";

const IMAGE_PICK_REQUEST: PickRequest = {
	title: "Add images",
	accepts: "PNG, JPEG, WebP, GIF or AVIF images, up to 10 MB each",
	types: Array.from(ALLOWED_IMAGE_MIME_TYPES),
	maxBytes: MAX_IMAGE_BYTES,
	maxFiles: 10,
	pasteHint: "Copy an image or image file, then press Ctrl+V",
	sensitive: true,
};

const ImageCard = ({
	image,
	activeTag,
	onSelectTag,
	onOpen,
	onDelete,
	showDelete = true,
}: {
	image: ImageRecord;
	activeTag?: string | null;
	onSelectTag?: (tag: string) => void;
	onOpen: (image: ImageRecord) => void;
	onDelete?: (id: string) => Promise<unknown> | void;
	showDelete?: boolean;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const blob = useImageBlob(image.id, image.mimeType);
	const url = useObjectUrl(blob);
	const tags = image.tags ?? [];

	return (
		<div
			className={`flex w-full cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border p-2.5 transition-colors active:scale-[0.99] ${
				isDark
					? "border-neutral-800 bg-neutral-900/70 text-neutral-100 hover:border-neutral-700"
					: "border-neutral-200 bg-neutral-100/70 text-neutral-900 hover:border-neutral-300"
			}`}
			{...pressable(() => onOpen(image))}
			aria-label={`Open image: ${image.title}`}
		>
			<div>
				<div
					className={`flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl ${
						isDark ? "bg-neutral-950" : "bg-neutral-200/70"
					}`}
				>
					{url ? (
						<img
							src={url}
							alt={image.title}
							loading="lazy"
							className="h-full w-full object-cover"
							draggable={false}
						/>
					) : (
						<LUIThemedIcon
							Icon={ImageIcon}
							color="currentColor"
							weight="regular"
							className="size-7 opacity-40"
						/>
					)}
				</div>
				<div className="mt-2 truncate text-xs font-semibold">
					{image.title}
				</div>
				{tags.length > 0 ? (
					<LUITagChips
						tags={tags}
						activeTag={activeTag}
						onSelect={onSelectTag}
						maxVisible={3}
						className="mt-1.5"
					/>
				) : null}
			</div>
			<div className="mt-2 flex flex-wrap items-center justify-between gap-1">
				<span
					className={`text-[11px] whitespace-nowrap ${
						isDark ? "text-neutral-400" : "text-neutral-500"
					}`}
				>
					{getNoteCardTimeLabel(image.updatedAt)}
				</span>
				{showDelete ? (
					<div
						className="ml-auto shrink-0"
						onClick={(event) => event.stopPropagation()}
					>
						<LUIDeleteButton
							subject="image"
							onDelete={() => onDelete?.(image.id)}
							failureMessage="Couldn't delete this image."
						/>
					</div>
				) : null}
			</div>
		</div>
	);
};

const saveBlobAsImage = async (
	blob: Blob,
	rawName: string,
	rawType: string,
	owner: SendOptions,
): Promise<boolean> => {
	const cleanedType = (rawType || blob.type || "")
		.toLowerCase()
		.split(";")[0];
	const mimeType = cleanedType === "image/jpg" ? "image/jpeg" : cleanedType;
	if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
		await createToast(
			"Use a PNG, JPEG, WebP, GIF, or AVIF image.",
			LTOAST_TYPE.ERROR,
		);
		return false;
	}
	const bytes = new Uint8Array(await blob.arrayBuffer());
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
		await createToast(
			"Image must be non-empty and under 10 MB.",
			LTOAST_TYPE.ERROR,
		);
		return false;
	}
	const title = rawName
		? rawName.replace(/\.[a-z0-9]{2,5}$/i, "").slice(0, 100)
		: "Pasted image";
	await send(
		"image.create",
		{
			bytesBase64: toBase64(bytes),
			mimeType,
			title: title || "Saved image",
		},
		owner,
	);
	return true;
};

const Component = ({
	className,
	images,
	activeTag = null,
	onSelectTag,
}: {
	className?: string;
	images: Array<ImageRecord>;
	activeTag?: string | null;
	onSelectTag?: (tag: string) => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const go = useMoveNavigate();
	const picked = usePickedFile(IMAGE_SLOT, { sensitive: true });
	const [busy, setBusy] = useState(false);
	const consumingRef = useRef(false);

	const sortedImages = useMemo(
		() => [...images].sort((a, b) => b.updatedAt - a.updatedAt),
		[images],
	);

	const { startIndex, endIndex, batchCount, currentBatch, onBatchChange } =
		usePagination(sortedImages.length, 20);

	const paginationImages = useMemo(
		() => sortedImages.slice(startIndex, endIndex),
		[sortedImages, startIndex, endIndex],
	);

	// Ingest images returned from the shared /pick-file upload screen.
	useEffect(() => {
		if (picked.files.length === 0 || consumingRef.current) return;
		consumingRef.current = true;
		setBusy(true);
		const filesToSave = [...picked.files];
		void (async () => {
			let savedCount = 0;
			try {
				for (const file of filesToSave) {
					try {
						if (!file.owner) {
							throw new Error("Staged image session expired.");
						}
						const ok = await saveBlobAsImage(
							file.blob,
							file.name,
							file.blob.type,
							file.owner,
						);
						if (ok) savedCount += 1;
					} finally {
						await picked.remove(file.id);
					}
				}
				if (savedCount > 0) {
					await createToast(
						savedCount === 1
							? "Image saved."
							: `${savedCount} images saved.`,
						LTOAST_TYPE.SUCCESS,
					);
				}
			} catch (error) {
				await createToast(
					error instanceof Error
						? error.message
						: "Couldn't save image.",
					LTOAST_TYPE.ERROR,
				);
			} finally {
				consumingRef.current = false;
				setBusy(false);
			}
		})();
	}, [picked]);

	useEffect(() => {
		const handlePasteFiles = async (files: Array<File>) => {
			if (files.length === 0 || busy) return;
			setBusy(true);
			try {
				const session = await sessionStore.get();
				if (!session) {
					throw new Error("Unlock a profile first.");
				}
				const owner: SendOptions = {
					profileId: session.profileId,
					unlockId: session.unlockId,
				};
				let savedCount = 0;
				for (const file of files) {
					if (
						await saveBlobAsImage(file, file.name, file.type, owner)
					) {
						savedCount += 1;
					}
				}
				if (savedCount > 0) {
					await createToast(
						savedCount === 1
							? "Image saved."
							: `${savedCount} images saved.`,
						LTOAST_TYPE.SUCCESS,
					);
				}
			} catch (error) {
				await createToast(
					error instanceof Error
						? error.message
						: "Couldn't save image.",
					LTOAST_TYPE.ERROR,
				);
			} finally {
				setBusy(false);
			}
		};

		const onPaste = (event: ClipboardEvent) => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" || target.tagName === "TEXTAREA")
			) {
				return;
			}
			const items = event.clipboardData?.items;
			if (!items) return;
			const imageFiles: Array<File> = [];
			for (const item of Array.from(items)) {
				if (item.type.startsWith("image/")) {
					const file = item.getAsFile();
					if (file) imageFiles.push(file);
				}
			}
			if (imageFiles.length > 0) {
				event.preventDefault();
				void handlePasteFiles(imageFiles);
			}
		};
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	}, [busy]);

	const handleOpenUploadScreen = () => {
		go(pickRoute(IMAGE_PICK_REQUEST, IMAGE_SLOT, "/home"), "outOf");
	};

	return (
		<motion.div
			className={twMerge(
				`flex h-full w-full flex-col overflow-y-hidden pb-1`,
				className,
			)}
		>
			<div className="mx-auto flex w-full max-w-3xl shrink-0 flex-wrap items-center justify-between gap-2 px-4 py-1.5">
				<div className="flex items-center gap-x-2.5">
					<span
						className={`text-xs font-medium ${
							isDark ? "text-neutral-400" : "text-neutral-500"
						}`}
					>
						{sortedImages.length} image
						{sortedImages.length === 1 ? "" : "s"}
					</span>
					{batchCount > 1 ? (
						<LUIPagination
							currentBatch={currentBatch}
							batchCount={batchCount}
							onBatchChange={onBatchChange}
						/>
					) : null}
				</div>
				<button
					type="button"
					aria-label="Add image"
					disabled={busy}
					onClick={handleOpenUploadScreen}
					className={`flex h-7 cursor-pointer items-center gap-x-1 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${
						isDark
							? "border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
							: "border-neutral-300 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
					}`}
				>
					<LUIThemedIcon
						Icon={PlusIcon}
						color="currentColor"
						weight="regular"
						className="size-3.5"
					/>
					<span>{busy ? "Saving…" : "Add image"}</span>
				</button>
			</div>

			{paginationImages.length > 0 ? (
				<div
					className={`w-full grow overflow-y-auto px-4 pb-24 ${theme}-scrollbar`}
				>
					<div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-2.5 min-[600px]:grid-cols-3">
						{paginationImages.map((image) => (
							<ImageCard
								key={image.id}
								image={image}
								activeTag={activeTag}
								onSelectTag={onSelectTag}
								onOpen={(selected) =>
									go(`/image/${selected.id}`, "forward")
								}
								onDelete={(id) => send("image.delete", { id })}
							/>
						))}
					</div>
				</div>
			) : (
				<LUIEmptyState
					title="No images yet?"
					hint="Right-click any image on the web, paste here, or tap Add image."
				/>
			)}
		</motion.div>
	);
};

export { Component as LUIImages, ImageCard as LUIImageMini };
