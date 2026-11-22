import { useMemo } from "react";
import type { ContextProviderProps } from "../../types";
import { useRecordsSource } from "../hooks/useRecords";
import { useProfileKeys } from "../hooks/useSession";
import { RecordsContext, type Records } from "./RecordsContext";

// Reads and opens the unlocked profile's records once, above the routes,
// so moving between pages neither reads nor decrypts them again.
const RecordsProvider: React.FC<ContextProviderProps> = ({ children }) => {
	const keys = useProfileKeys();
	const { saves, notes, images, tasks, reminders, links } =
		useRecordsSource(keys);
	const value = useMemo<Records>(
		() => ({ saves, notes, images, tasks, reminders, links }),
		[saves, notes, images, tasks, reminders, links],
	);
	return (
		<RecordsContext.Provider value={value}>
			{children}
		</RecordsContext.Provider>
	);
};

export { RecordsProvider };
