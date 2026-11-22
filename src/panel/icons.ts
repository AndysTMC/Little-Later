import { ExportIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import type { LAIConfirmationKind } from "little-shared/types";

// The mark for each kind of change waiting for, or given, approval.
export const CONFIRMATION_ICON: Record<LAIConfirmationKind, typeof TrashIcon> =
	{
		mutate: PencilSimpleIcon,
		destructive: TrashIcon,
		external: ExportIcon,
	};
