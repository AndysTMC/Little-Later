import { useRef, useState } from "react";
import { IdentificationBadgeIcon } from "@phosphor-icons/react";
import { fakeWait } from "little-shared/utils/misc";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUIAvatarInput } from "../../components/LUIAvatarInput/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { createUser } from "../../../services/user";
import { LTHEME } from "little-shared/enums";

const Page = () => {
	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideRight,
	});

	const navigate = useNavigate();
	const [name, setName] = useState("");

	const [avatar, setAvatar] = useState<Blob | null>(null);

	const avatarInputRef = useRef<HTMLInputElement>(null);

	const handleCreate = async () => {
		if (name === "") {
			return;
		}
		await fakeWait();
		await createUser(name, avatar);
		navigate("/browse-profiles", {
			state: { entryTransition: entryTransitions.slideRight },
		});
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
						<div
							className={`bg-enutral-100 flex h-12 w-72 items-center rounded-lg border border-solid border-neutral-300`}
						>
							<div
								className={`flex h-12 w-16 items-center justify-center`}
							>
								<LUIThemedIcon
									Icon={IdentificationBadgeIcon}
									weight="fill"
									className="h-7 w-7"
									passedTheme={LTHEME.LIGHT}
								/>
							</div>
							<div className={`h-full grow`}>
								<input
									type="text"
									placeholder="Name"
									value={name}
									onChange={(event) =>
										setName(event.target.value)
									}
									className={`h-full w-full border-none bg-transparent text-xl font-thin text-black outline-none`}
								/>
							</div>
						</div>
					</div>
					<div className="flex h-12 w-full items-center justify-center">
						<LUICUButton
							name="Create"
							onClick={handleCreate}
							passedTheme={LTHEME.LIGHT}
						/>
					</div>
				</div>
			</div>
		</motion.div>
	);
};

export { Page as LUIProfileCreator };
