// The password only wraps the profile's key (0010): setting, changing or
// removing it re-wraps the key and touches no record.
export const NO_PASSWORD_NOTE =
	"Without a password, this profile is not encrypted at rest: anyone using this browser can open it.";

export const passwordProblem = (password: string): string | null =>
	password !== password.trim()
		? "A password can't start or end with a space."
		: null;
