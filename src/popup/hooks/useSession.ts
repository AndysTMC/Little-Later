import { useEffect, useState } from "react";
import { importProfileKeys, type ProfileKeys } from "../../storage/keys";
import { sessionStore, type UnlockedSession } from "../../storage/session";

type SessionState =
	| { isResolved: false; session: null }
	| { isResolved: true; session: UnlockedSession | null };

// The unlocked session, kept current: locking anywhere, including by the
// worker's auto-lock, clears it here too (0010, Locking).
const useSession = (): SessionState => {
	const [state, setState] = useState<SessionState>({
		isResolved: false,
		session: null,
	});
	useEffect(() => {
		let active = true;
		const unsubscribe = sessionStore.subscribe((session) => {
			if (active) setState({ isResolved: true, session });
		});
		void sessionStore.get().then((session) => {
			if (active) setState({ isResolved: true, session });
		});
		return () => {
			active = false;
			unsubscribe();
		};
	}, []);
	return state;
};

// The unlocked profile's keys for decrypting reads; null while locked and
// undefined until known.
const useProfileKeys = (): ProfileKeys | null | undefined => {
	const { isResolved, session } = useSession();
	const [imported, setImported] = useState<{
		session: UnlockedSession;
		keys: ProfileKeys;
	} | null>(null);
	useEffect(() => {
		if (!session) return;
		let active = true;
		void importProfileKeys(session).then((keys) => {
			if (active) setImported({ session, keys });
		});
		return () => {
			active = false;
		};
	}, [session]);
	if (!isResolved) return undefined;
	if (!session) return null;
	// Keys imported for an earlier session never leak into a later one.
	return imported?.session === session ? imported.keys : undefined;
};

export { useSession, useProfileKeys };
