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
		<div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2">
			<div
				role="status"
				className={`flex w-full items-start gap-x-2 rounded-xl border px-3 py-2 text-xs leading-relaxed ${
					isDark
						? "border-amber-500/30 bg-amber-950/30 text-amber-200"
						: "border-amber-300 bg-amber-50 text-amber-900"
				}`}
			>
				<LUIThemedIcon
					Icon={BellSlashIcon}
					color="currentColor"
					weight="fill"
					className="mt-0.5 size-4 shrink-0"
				/>
				<p>
					Notifications are off for Little Later, so reminders can't
					appear. Turn them back on in Chrome's notification settings.
				</p>
			</div>
		</div>
	);
};

export { Component as LUINotificationsOff };
