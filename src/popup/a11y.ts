import type { KeyboardEvent } from "react";

// Makes an element that is not a <button> behave like one for keyboard and
// assistive technology: focusable, announced as a button, and activated by
// Enter or Space. For controls whose layout depends on being a block
// element; plain controls should be real buttons.
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
