import { useConfirm } from "../../hooks/useConfirm";
import { LUIPillButton } from "../LUIPillButton/Component";

// How a list item is deleted, everywhere (docs/design.md, Confirming): a
// small "Delete" pill. The first press arms it, red and reading "Confirm
// delete", for a few seconds; the second deletes. No icon: the word says it.
const Component = ({
	onDelete,
	subject,
	failureMessage,
	disabled = false,
	className,
}: {
	onDelete: () => Promise<unknown> | void;
	// What is deleted, for the accessible name ("Delete note"); the visible
	// label stays "Delete".
	subject?: string;
	failureMessage?: string;
	disabled?: boolean;
	className?: string;
}) => {
	const { armed, press } = useConfirm(onDelete, failureMessage);
	const label = armed ? "Confirm delete" : "Delete";
	return (
		<LUIPillButton
			label={label}
			ariaLabel={subject ? `${label} ${subject}` : undefined}
			tone={armed ? "danger" : "default"}
			disabled={disabled}
			className={className}
			onClick={() => void press()}
		/>
	);
};

export { Component as LUIDeleteButton };
