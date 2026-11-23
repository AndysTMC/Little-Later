import { LockIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import { LUICUButton } from "../popup/components/LUICUButton/Component";
import { LUINote } from "../popup/components/LUINote/Component";
import { LUIThemedIcon } from "../popup/components/LUIThemedIcon/Component";
import { useTheme } from "../popup/hooks/useTheme";

// The side panel holds no unlock screens (decision 0017): unlocking stays
// in the popup, which this opens.
const Locked = () => {
	const { theme } = useTheme();
	const [hint, setHint] = useState(false);
	return (
		<div
			className={`flex h-full w-full flex-col items-center justify-center gap-y-5 px-6 ${theme === LTHEME.DARK ? "bg-black text-white" : "bg-white text-black"}`}
		>
			<LUIThemedIcon Icon={LockIcon} className="size-12" />
			<h1 className="text-center text-2xl font-semibold">
				Your profile is locked
			</h1>
			<LUINote>
				Unlock it in Little Later, and Little AI picks up here.
			</LUINote>
			<LUICUButton
				name="Open Little Later"
				onClick={async () => {
					try {
						await chrome.action.openPopup();
					} catch {
						setHint(true);
					}
				}}
			/>
			{hint ? (
				<LUINote>
					Chrome didn't open it here: use the Little Later icon in the
					toolbar.
				</LUINote>
			) : null}
		</div>
	);
};

export { Locked };
