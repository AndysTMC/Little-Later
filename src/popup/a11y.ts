import type { KeyboardEvent } from "react";

/**
 * Makes a non-button container behave like a button for keyboard and assistive
 * technology: focusable, exposed with `role="button"`, and activated by Enter
 * or Space when focused directly.
 *
 * Reserve for composite card layouts that cannot be nested inside `<button>`.
 */
export const pressable = (onPress: () => void) => ({
	role: "button" as const,
	tabIndex: 0,
	onClick: onPress,
	onKeyDown: (event: KeyboardEvent) => {
		if (event.target !== event.currentTarget) {
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onPress();
		}
	},
});
