import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { openBody } from "../../storage/keys";
import { littleDB } from "../../storage/pageDB";
import { defaultSettings, type Settings } from "../../storage/repositories";
import type { SettingsRow } from "../../storage/schema";
import { useProfileKeys } from "./useSession";

// The unlocked profile's sealed settings: AI provider and history limits.
const useCurrentUserSettings = (): Settings | undefined => {
	const keys = useProfileKeys();
	const profileId = keys?.profileId;
	// null: the profile has no settings row yet, so it uses the defaults.
	const row = useLiveQuery(
		async (): Promise<SettingsRow | null | undefined> =>
			profileId === undefined
				? undefined
				: ((await littleDB.settings.get(profileId)) ?? null),
		[profileId],
		undefined,
	);
	const [opened, setOpened] = useState<{
		row: SettingsRow;
		settings: Settings;
	} | null>(null);
	useEffect(() => {
		if (!keys || !row) return;
		let active = true;
		void openBody<Settings>(keys, "settings", row.id, row.body).then(
			(settings) => {
				if (active) setOpened({ row, settings });
			},
		);
		return () => {
			active = false;
		};
	}, [keys, row]);
	if (!keys || row === undefined) return undefined;
	if (row === null) return defaultSettings();
	return opened?.row === row ? opened.settings : undefined;
};

export { useCurrentUserSettings };
