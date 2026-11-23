import { motion } from "framer-motion";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { LTHEME } from "little-shared/enums";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUIAvatarInput } from "../../components/LUIAvatarInput/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { LUITextArea } from "../../components/LUITextArea/Component";
import { LUIPillButton } from "../../components/LUIPillButton/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useCurrentUserSettings } from "../../hooks/useCurrentUserSettings";
import {
	useImages,
	useNotes,
	useReminders,
	useSaves,
	useTasks,
} from "../../hooks/useRecords";
import { send } from "../../../utils/send";
import { sendAvatar } from "../../../utils/avatar";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LMAX_NAME_LENGTH } from "little-shared/constants";
import { littleDB } from "../../../storage/pageDB";
import { useLiveQuery } from "dexie-react-hooks";
import Dexie from "dexie";

import { attempt } from "../../attempt";
import { useDebouncedSave } from "../../hooks/useDebouncedSave";

import { pickRoute } from "../../filePick";
import { AVATAR_REQUEST } from "../../components/LUIAvatarInput/request";
import { usePickedFile } from "../../hooks/usePickedFile";

const AVATAR_SLOT = "profile.avatar";
const MAX_INSTRUCTIONS_LENGTH = 1000;

import { useSettingDraft } from "../../hooks/useSettingDraft";

const sameTrimmed = (a: string, b: string) => a.trim() === b.trim();

const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatLastBackup = (timestamp: number | undefined): string => {
	if (!timestamp) return "Never";
	const days = Math.floor((Date.now() - timestamp) / 86_400_000);
	if (days <= 0) return "Today";
	if (days === 1) return "Yesterday";
	return `${days} days ago`;
};

// The profile's name, photo, vault overview, and AI personal instructions.
const Page = () => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const pageMotion = usePageMotion();

	const currentUserProfile = useCurrentUserProfile();
	const userSettings = useCurrentUserSettings();
	const saves = useSaves();
	const tasks = useTasks();
	const reminders = useReminders();
	const notes = useNotes();
	const images = useImages();
	const chatCount = useLiveQuery(
		async () =>
			currentUserProfile
				? littleDB.chats
						.where("[profileId+updatedAt]")
						.between(
							[currentUserProfile.id, Dexie.minKey],
							[currentUserProfile.id, Dexie.maxKey],
						)
						.count()
				: 0,
		[currentUserProfile?.id],
		0,
	);
	const [storageUsage, setStorageUsage] = useState<string | null>(null);

	useEffect(() => {
		if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
			return;
		}
		let active = true;
		void navigator.storage
			.estimate()
			.then(({ usage }) => {
				if (active && typeof usage === "number") {
					setStorageUsage(formatBytes(usage));
				}
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, []);

	const loading = useLoading([currentUserProfile, userSettings]);

	const currentUserAvatar = useUserAvatar(currentUserProfile?.id);

	const [nameDraft, setName] = useSettingDraft(
		"settings.profile.name",
		currentUserProfile?.name,
		sameTrimmed,
	);
	const name = nameDraft ?? "";

	const [instructionsDraft, setInstructions] = useSettingDraft(
		"settings.profile.aiInstructions",
		userSettings?.ai.instructions ?? "",
		sameTrimmed,
	);
	const instructions = instructionsDraft ?? "";

	const go = useMoveNavigate();
	// A photo chosen on the shared input screen is applied on return.
	const pickedAvatar = usePickedFile(AVATAR_SLOT);
	const { blob: pickedBlob, clear: clearPicked } = pickedAvatar;
	const appliedPick = useRef<Blob | null>(null);

	const handleUpdateAvatar = async (avatar: Blob | null) => {
		if (currentUserProfile === undefined) {
			return;
		}
		await attempt(
			() => sendAvatar(avatar),
			"Couldn't update the profile photo.",
		);
	};

	useEffect(() => {
		if (
			!pickedBlob ||
			currentUserProfile === undefined ||
			appliedPick.current === pickedBlob
		) {
			return;
		}
		appliedPick.current = pickedBlob;
		void attempt(
			() => sendAvatar(pickedBlob),
			"Couldn't update the profile photo.",
		).then(clearPicked);
	}, [pickedBlob, currentUserProfile, clearPicked]);

	const handleUpdateName = (name: string) => {
		setName(name);
	};

	const trimmedName = name.trim();
	useDebouncedSave(
		currentUserProfile !== undefined &&
			trimmedName !== currentUserProfile.name &&
			trimmedName !== "" &&
			trimmedName.length <= LMAX_NAME_LENGTH
			? () => send("profile.update", { name: trimmedName })
			: null,
		600,
		trimmedName,
	);

	const trimmedInstructions = instructions.trim();
	const storedInstructions = (userSettings?.ai.instructions ?? "").trim();
	useDebouncedSave(
		userSettings !== undefined &&
			trimmedInstructions !== storedInstructions &&
			trimmedInstructions.length <= MAX_INSTRUCTIONS_LENGTH
			? () =>
					send("settings.update", {
						ai: {
							...userSettings.ai,
							instructions: trimmedInstructions,
						},
					})
			: null,
		600,
		trimmedInstructions,
	);

	const validateName = (name: string) => {
		const trimmed = name.trim();
		if (trimmed === "") {
			return { success: false, error: "Name cannot be empty" };
		}
		if (trimmed.length > LMAX_NAME_LENGTH) {
			return { success: false, error: "Name is too long" };
		}
		return { success: true, error: "" };
	};

	// The page moves away and the upload screen comes in, as with Lock.
	const goToUpload = () => {
		go(pickRoute(AVATAR_REQUEST, AVATAR_SLOT, "/profile"), "outOf");
	};

	const savedCount = (saves ?? []).filter((save) => save.saved).length;
	const vaultStats = [
		{ label: "Saves", count: savedCount },
		{ label: "Tasks", count: tasks?.length ?? 0 },
		{ label: "Reminders", count: reminders?.length ?? 0 },
		{ label: "Notes", count: notes?.length ?? 0 },
		{ label: "Images", count: images?.length ?? 0 },
		{ label: "Chats", count: chatCount ?? 0 },
	];

	return (
		<motion.div
			className={`h-full w-full select-none ${isDark ? "bg-black" : "bg-white"}`}
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
					<LUIBasicNav navigateTo="/home" />
					<LUISettingsLayout pageName="Profile">
						<div
							className={`flex w-full grow flex-col justify-start gap-y-4 pt-3 pb-4`}
						>
							<div
								className={`flex w-full flex-col items-center justify-start gap-y-5 pt-2 pb-1`}
							>
								<div
									className={`flex h-max w-full items-center justify-center`}
								>
									<LUIAvatarInput
										avatar={currentUserAvatar ?? null}
										onChoose={() => goToUpload()}
										onRemove={() =>
											void handleUpdateAvatar(null)
										}
										theme={theme}
									/>
								</div>
								<LUITextInputT1
									name="Name"
									passedValue={name}
									onChange={handleUpdateName}
									lengthLimit={LMAX_NAME_LENGTH}
									validate={validateName}
								/>
							</div>

							<div
								className={`flex w-full flex-col gap-y-2.5 rounded-2xl border p-3.5 ${
									isDark
										? "border-neutral-800 bg-neutral-950/60"
										: "border-neutral-200 bg-white/80"
								}`}
							>
								<div className="flex items-center justify-between gap-x-2">
									<span
										className={`text-sm font-semibold ${
											isDark ? "text-white" : "text-black"
										}`}
									>
										Vault overview
									</span>
									{storageUsage ? (
										<span
											className={`text-xs ${
												isDark
													? "text-neutral-400"
													: "text-neutral-500"
											}`}
										>
											{storageUsage} used
										</span>
									) : null}
								</div>
								<div className="grid grid-cols-3 gap-2">
									{vaultStats.map((item) => (
										<div
											key={item.label}
											className={`flex flex-col rounded-xl border px-2.5 py-2 ${
												isDark
													? "border-neutral-800 bg-neutral-900/70"
													: "border-neutral-200 bg-neutral-100/70"
											}`}
										>
											<span
												className={`text-base font-semibold tabular-nums ${
													isDark
														? "text-white"
														: "text-black"
												}`}
											>
												{item.count}
											</span>
											<span
												className={`text-[11px] ${
													isDark
														? "text-neutral-400"
														: "text-neutral-500"
												}`}
											>
												{item.label}
											</span>
										</div>
									))}
								</div>
								<div className="flex items-center justify-between gap-x-2 pt-0.5">
									<span
										className={`text-xs ${
											isDark
												? "text-neutral-400"
												: "text-neutral-600"
										}`}
									>
										Last backup:{" "}
										{formatLastBackup(
											userSettings?.misc.lastBackupAt,
										)}
									</span>
									<LUIPillButton
										label="Export backup"
										onClick={() => go("/export", "forward")}
									/>
								</div>
							</div>

							<div className="flex w-full flex-col gap-y-1">
								<LUITextArea
									name="About me (Little AI instructions)"
									passedValue={instructions}
									onChange={setInstructions}
									lengthLimit={MAX_INSTRUCTIONS_LENGTH}
									validate={(value) =>
										value.length > MAX_INSTRUCTIONS_LENGTH
											? {
													success: false,
													error: "Instructions are too long",
												}
											: { success: true, error: "" }
									}
								/>
								<p
									className={`px-0.5 text-xs ${
										isDark
											? "text-neutral-400"
											: "text-neutral-500"
									}`}
								>
									Optional preferences shared with Little AI
									(e.g., tone, timezone, or preferred format).
								</p>
							</div>
						</div>
					</LUISettingsLayout>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIProfile };
