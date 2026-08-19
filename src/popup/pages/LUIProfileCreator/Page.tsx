import { useRef, useState } from "react";
import { IdentificationBadgeIcon } from "@phosphor-icons/react";
import { fakeWait } from "little-shared/utils/misc";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAvatarInput } from "../../components/LUIAvatarInput/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { LUIIconField } from "../../components/LUIIconField/Component";
import { createUser } from "../../../services/user";
import { LTHEME, LTOAST_TYPE } from "little-shared/enums";
import { LMAX_NAME_LENGTH } from "little-shared/constants";
import { createToast } from "../../../services/toasts";

const Page = () => {
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});

	const navigate = useNavigate();
	const [name, setName] = useState("");

	const [avatar, setAvatar] = useState<Blob | null>(null);

	const avatarInputRef = useRef<HTMLInputElement>(null);

	const handleCreate = async () => {
		const trimmedName = name.trim();
		if (trimmedName === "" || trimmedName.length > LMAX_NAME_LENGTH) {
			return;
		}
		await fakeWait();
		try {
			await createUser(trimmedName, avatar);
			navigate("/browse-profiles", {
				state: { entryTransition: entryTransitions.slideRight },
			});
		} catch (error) {
			await createToast(
				error instanceof Error
					? error.message
					: "Couldn't create this profile.",
				LTOAST_TYPE.ERROR,
			);
		}
	};

	return (
		<motion.div
			className={`flex h-full w-full flex-col bg-white select-none`}
			{...entry}
			{...exit}
		>
			<LUIBasicNav
				navigateTo="/browse-profiles"
				passedTheme={LTHEME.LIGHT}
			/>
			<div
				className={`flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-hidden`}
			>
				<div
					className={`mt-5 flex items-center justify-center text-4xl font-semibold text-black`}
				>
					New Profile
				</div>
				<div
					className={`flex w-full grow flex-col items-center justify-start gap-y-5 overflow-y-hidden px-12 pt-5 pb-1`}
				>
					<div
						className={`flex h-max w-full items-center justify-center`}
					>
						<LUIAvatarInput
							avatar={avatar}
							setAvatar={setAvatar}
							avatarInputRef={avatarInputRef}
							theme={LTHEME.LIGHT}
						/>
					</div>
					<div className="flex h-12 w-full items-center justify-center">
						<LUIIconField
							id="little-new-profile-name"
							icon={IdentificationBadgeIcon}
							placeholder="Name"
							ariaLabel="Profile name"
							maxLength={LMAX_NAME_LENGTH}
							value={name}
							onChange={setName}
							onSubmit={() => {
								void handleCreate();
							}}
							passedTheme={LTHEME.LIGHT}
						/>
					</div>
					<div className="flex h-12 w-full items-center justify-center">
						<LUICUButton
							name="Create"
							onClick={handleCreate}
							passedTheme={LTHEME.LIGHT}
							disabled={name.trim() === ""}
						/>
					</div>
				</div>
			</div>
		</motion.div>
	);
};

export { Page as LUIProfileCreator };
