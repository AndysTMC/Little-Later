import { BellSlashIcon } from "@phosphor-icons/react";
import { LTHEME } from "little-shared/enums";
import { useTheme } from "../../hooks/useTheme";
import { LUIThemedIcon } from "../LUIThemedIcon/Component";

// Shown on Home while Chrome has notifications off for Little Later:
// reminders still count as fired then, so nothing would say they were
// missed.
const Component = () => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	return (
		<div
			role="status"
			className={`flex w-full shrink-0 items-start gap-x-2 border-b px-5 py-2 text-sm ${
				isDark
					? "border-neutral-700 text-neutral-200"
					: "border-neutral-300 text-neutral-800"
			}`}
		>
			<LUIThemedIcon
				Icon={BellSlashIcon}
				weight="fill"
				className="mt-0.5 size-4 shrink-0"
			/>
			<p>
				Notifications are off for Little Later, so reminders can't
				appear. Turn them back on in Chrome's notification settings.
			</p>
		</div>
	);
};

export { Component as LUINotificationsOff };
