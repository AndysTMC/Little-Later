import { fromBase64, toBase64 } from "../storage/session";

// The WebAuthn half of two-factor unlock (decision 0015). It runs in the
// page: the worker has no navigator.credentials. The relying party is the
// extension itself (its id, the default for a chrome-extension: page), so
// a passkey made here works only for Little Later. The authenticator's PRF
// output is the secret that, with the password, opens the profile.

export class WebAuthnError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WebAuthnError";
	}
}

const NO_PRF =
	"This key or passkey can't protect a profile: it has no PRF support. Use a recent security key (with hmac-secret), or a passkey saved in Google Password Manager.";

const random = (length: number) =>
	crypto.getRandomValues(new Uint8Array(length));

const buffer = (bytes: Uint8Array): ArrayBuffer =>
	bytes.slice().buffer as ArrayBuffer;

const base64url = (bytes: Uint8Array) =>
	toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// A cancelled or timed-out prompt reads as such, not as an error code.
const explain = (error: unknown): never => {
	if (error instanceof WebAuthnError) throw error;
	if (error instanceof DOMException && error.name === "NotAllowedError") {
		throw new WebAuthnError(
			"The security key prompt was closed or timed out.",
		);
	}
	if (error instanceof DOMException && error.name === "InvalidStateError") {
		throw new WebAuthnError("That key is already set up for this profile.");
	}
	throw new WebAuthnError(
		error instanceof Error && error.message
			? error.message
			: "The security key couldn't be used.",
	);
};

export const webAuthnAvailable = (): boolean =>
	typeof navigator !== "undefined" &&
	typeof navigator.credentials?.create === "function" &&
	typeof PublicKeyCredential !== "undefined";

export type FactorProof = {
	// base64, as commands take them.
	credentialId: string;
	secret: string;
};

// Asks one of the profile's authenticators for its PRF output.
export const proveFactor = async (
	authenticators: ReadonlyArray<{ credentialId: string; prfSalt: string }>,
): Promise<FactorProof> => {
	let credential: PublicKeyCredential;
	try {
		credential = (await navigator.credentials.get({
			publicKey: {
				challenge: buffer(random(32)),
				allowCredentials: authenticators.map((entry) => ({
					type: "public-key",
					id: buffer(fromBase64(entry.credentialId)),
				})),
				userVerification: "preferred",
				timeout: 120_000,
				extensions: {
					prf: {
						evalByCredential: Object.fromEntries(
							authenticators.map((entry) => [
								base64url(fromBase64(entry.credentialId)),
								{ first: buffer(fromBase64(entry.prfSalt)) },
							]),
						),
					},
				},
			},
		})) as PublicKeyCredential;
	} catch (error) {
		return explain(error);
	}
	const first = credential.getClientExtensionResults().prf?.results?.first;
	if (!first) throw new WebAuthnError(NO_PRF);
	return {
		credentialId: toBase64(new Uint8Array(credential.rawId)),
		secret: toBase64(new Uint8Array(first as ArrayBuffer)),
	};
};

// What a key is called in Settings, from what the browser reports: a
// passkey (on this device or a phone) or a security key. With the date it
// was added, that tells keys apart without asking for a name.
const kindOf = (credential: PublicKeyCredential): string => {
	const response = credential.response as AuthenticatorAttestationResponse;
	const transports = response.getTransports?.() ?? [];
	return credential.authenticatorAttachment === "platform" ||
		transports.includes("internal") ||
		transports.includes("hybrid")
		? "Passkey"
		: "Security key";
};

export type NewFactor = FactorProof & { prfSalt: string; name: string };

// Makes a credential for this profile and reads its PRF output. Some
// authenticators give it only on a later assertion, so one is asked for
// when the creation did not include it.
export const registerFactor = async (
	profile: { id: string; name: string },
	existing: ReadonlyArray<{ credentialId: string }>,
): Promise<NewFactor> => {
	const prfSalt = random(32);
	let credential: PublicKeyCredential;
	try {
		credential = (await navigator.credentials.create({
			publicKey: {
				rp: { name: "Little Later" },
				user: {
					id: buffer(random(16)),
					name: profile.name,
					displayName: profile.name,
				},
				challenge: buffer(random(32)),
				pubKeyCredParams: [
					{ type: "public-key", alg: -7 },
					{ type: "public-key", alg: -8 },
					{ type: "public-key", alg: -257 },
				],
				excludeCredentials: existing.map((entry) => ({
					type: "public-key",
					id: buffer(fromBase64(entry.credentialId)),
				})),
				authenticatorSelection: { userVerification: "preferred" },
				timeout: 120_000,
				extensions: { prf: { eval: { first: buffer(prfSalt) } } },
			},
		})) as PublicKeyCredential;
	} catch (error) {
		return explain(error);
	}
	const prf = credential.getClientExtensionResults().prf;
	if (prf?.enabled === false) throw new WebAuthnError(NO_PRF);
	const credentialId = toBase64(new Uint8Array(credential.rawId));
	const name = kindOf(credential);
	const first = prf?.results?.first;
	if (first) {
		return {
			credentialId,
			prfSalt: toBase64(prfSalt),
			secret: toBase64(new Uint8Array(first as ArrayBuffer)),
			name,
		};
	}
	const proof = await proveFactor([
		{ credentialId, prfSalt: toBase64(prfSalt) },
	]);
	return { ...proof, prfSalt: toBase64(prfSalt), name };
};
