import { motion } from "framer-motion";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { LTHEME } from "little-shared/enums";
import { useEffect, useRef } from "react";
import { useTheme } from "../../hooks/useTheme";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUISettingsLayout } from "../../components/LUISettingsLayout/Component";
import { LUIAvatarInput } from "../../components/LUIAvatarInput/Component";
import { LUITextInputT1 } from "../../components/LUITextInput/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { send } from "../../../utils/send";
import { sendAvatar } from "../../../utils/avatar";
import { useUserAvatar } from "../../hooks/useUserAvatar";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LMAX_NAME_LENGTH } from "little-shared/constants";

import { attempt } from "../../attempt";
import { useDebouncedSave } from "../../hooks/useDebouncedSave";

import { pickRoute } from "../../filePick";
import { AVATAR_REQUEST } from "../../components/LUIAvatarInput/request";
import { usePickedFile } from "../../hooks/usePickedFile";

const AVATAR_SLOT = "profile.avatar";

import { useSettingDraft } from "../../hooks/useSettingDraft";

const sameTrimmed = (a: string, b: string) => a.trim() === b.trim();

// The profile's name and photo. Its password and auto-lock are on the
// Security page, its theme on Appearance.
const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();

	const currentUserProfile = useCurrentUserProfile();

	const loading = useLoading([currentUserProfile]);

	const currentUserAvatar = useUserAvatar(currentUserProfile?.id);

	const [nameDraft, setName] = useSettingDraft(
		"settings.profile.name",
		currentUserProfile?.name,
		sameTrimmed,
	);
	const name = nameDraft ?? "";

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

	const validateName = (name: string) => {
		if (name.length > LMAX_NAME_LENGTH) {
			return { success: false, error: "Name is too long" };
		}
		return { success: true, error: "" };
	};

	// The page moves away and the upload screen comes in, as with Lock.
	const goToUpload = () => {
		go(pickRoute(AVATAR_REQUEST, AVATAR_SLOT, "/profile"), "outOf");
	};

	return (
		<motion.div
			className={`h-full w-full select-none ${theme === LTHEME.DARK ? "bg-black" : "bg-white"}`}
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
							className={`flex w-full grow flex-col justify-start gap-y-2 pt-3`}
						>
							<div
								className={`flex w-full grow flex-col items-center justify-start gap-y-5 pt-2 pb-1`}
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
						</div>
					</LUISettingsLayout>
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUIProfile };
