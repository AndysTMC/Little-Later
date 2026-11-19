import { motion } from "framer-motion";
import { PasswordIcon } from "@phosphor-icons/react";
import { LTOAST_TYPE, LTHEME } from "little-shared/enums";
import { useState } from "react";
import { useParams } from "react-router";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { LUIIconField } from "../../components/LUIIconField/Component";
import { LUIIdentityPage } from "../../components/LUIIdentityPage/Component";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUINote } from "../../components/LUINote/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useLoading } from "../../hooks/useLoading";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { createToast } from "../../../services/toasts";
import { send } from "../../../utils/send";
import { registerFactor, webAuthnAvailable } from "../../webauthn";
import {
	finishCeremonyWindow,
	inToolbarPopup,
	openCeremonyWindow,
} from "../../ceremonyWindow";
import { TWO_FACTOR_ROUTE, addedOn } from "../../twoFactor";

type Action = "add" | "recovery-code" | "off" | "remove";

const TITLES: Record<Action, string> = {
	add: "Add a key",
	"recovery-code": "New recovery code",
	off: "Turn off",
	remove: "Remove key",
};

const isAction = (value: string | undefined): value is Action =>
	value !== undefined && Object.hasOwn(TITLES, value);

// One change to two-factor unlock, confirmed with the password: an
// identity screen, like changing the password. Adding a key runs its
// prompt, which from the toolbar popup happens in a window of its own; a
// new recovery code is shown here once.
const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const go = useMoveNavigate();
	const profile = useCurrentUserProfile();
	const loading = useLoading([profile]);
	const { action, credential } = useParams();
	const isDark = theme === LTHEME.DARK;

	const [password, setPassword] = useState("");
	const [warning, setWarning] = useState("");
	const [busy, setBusy] = useState(false);
	const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [inPopup] = useState(inToolbarPopup);

	// Back to the list, or, in a key's own window, back to the toolbar.
	const done = async () => {
		if (await finishCeremonyWindow()) return;
		go(TWO_FACTOR_ROUTE, "back", { replace: true });
	};

	const page = (children: React.ReactNode) => (
		<motion.div
			className={`flex h-full w-full flex-col overflow-y-hidden select-none ${isDark ? "bg-black" : "bg-white"}`}
			{...pageMotion}
		>
			<LUIBasicNav navigateTo={TWO_FACTOR_ROUTE} />
			{children ?? <LUILoading />}
		</motion.div>
	);

	if (loading || !profile) return page(null);
	const key = profile.authenticators?.find(
		(entry) => entry.credentialId === credential,
	);
	if (
		!isAction(action) ||
		(action !== "add" && profile.authenticators === null) ||
		(action === "remove" && !key) ||
		!profile.hasPassword
	) {
		return page(<LUIEmptyState title="Nothing to change here." />);
	}

	const run = async () => {
		setWarning("");
		if (password === "") {
			setWarning("Enter this profile's password.");
			return;
		}
		setBusy(true);
		try {
			if (action === "add") {
				const factor = await registerFactor(
					{ id: profile.id, name: profile.name },
					profile.authenticators ?? [],
				);
				const result = await send("profile.addAuthenticator", {
					password,
					...factor,
				});
				if (result.recoveryCode) {
					setRecoveryCode(result.recoveryCode);
					return;
				}
				await createToast(`${factor.name} added.`, LTOAST_TYPE.SUCCESS);
			} else if (action === "recovery-code") {
				const result = await send("profile.newRecoveryCode", {
					password,
				});
				setRecoveryCode(result.recoveryCode);
				return;
			} else if (action === "off") {
				await send("profile.disableSecondFactor", { password });
				await createToast(
					"Two-factor unlock is off: the password alone unlocks the profile.",
					LTOAST_TYPE.SUCCESS,
				);
			} else if (key) {
				await send("profile.removeAuthenticator", {
					password,
					credentialId: key.credentialId,
				});
				await createToast(`${key.name} removed.`, LTOAST_TYPE.SUCCESS);
			}
			await done();
		} catch (error) {
			setWarning(
				error instanceof Error && error.message
					? error.message
					: "That didn't work. Try again.",
			);
		} finally {
			setBusy(false);
		}
	};

	const explanation: Record<Action, string> = {
		add:
			profile.authenticators === null
				? "Unlocking will need this key as well as the password. You'll get a recovery code, shown once, for when the key isn't at hand."
				: "This key will unlock the profile with the password, like the others.",
		"recovery-code":
			"A new code replaces the old one, which stops working. It is shown once.",
		off: "The password alone will unlock the profile again, and the keys and recovery code stop working.",
		remove: key
			? `${key.name} added ${addedOn(key.addedAt)} will no longer unlock the profile.${profile.authenticators?.length === 1 ? " It is the last key, so two-factor unlock turns off." : ""}`
			: "",
	};
	const actionName: Record<Action, string> = {
		add: "Add key",
		"recovery-code": "Make a new code",
		off: "Turn off",
		remove: "Remove key",
	};

	if (recoveryCode) {
		return page(
			<LUIIdentityPage title="Recovery code" profile={profile}>
				<LUINote>
					It is shown only now. Write it down or keep it somewhere
					safe: with the password, it opens the profile without a key.
				</LUINote>
				<code
					className={`w-72 shrink-0 text-center font-mono text-lg tracking-wide select-all ${isDark ? "text-white" : "text-black"}`}
				>
					{recoveryCode}
				</code>
				<LUICUButton name="Done" onClick={done} />
				<LUICUButton
					variant="secondary"
					name={copied ? "Copied" : "Copy"}
					onClick={async () => {
						await navigator.clipboard.writeText(recoveryCode);
						setCopied(true);
					}}
				/>
			</LUIIdentityPage>,
		);
	}

	// The key prompt would close the toolbar popup.
	if (action === "add" && inPopup && webAuthnAvailable()) {
		return page(
			<LUIIdentityPage title={TITLES[action]} profile={profile}>
				<LUINote>{explanation[action]}</LUINote>
				<LUINote>
					The key's prompt closes this popup, so adding it continues
					in a small window.
				</LUINote>
				<LUICUButton
					name="Continue in a new window"
					onClick={() =>
						openCeremonyWindow(`${TWO_FACTOR_ROUTE}/add`)
					}
				/>
			</LUIIdentityPage>,
		);
	}

	return page(
		<LUIIdentityPage
			title={TITLES[action]}
			profile={profile}
			busy={busy}
			onSubmit={(event) => {
				event.preventDefault();
				void run();
			}}
		>
			<LUIIconField
				id="little-two-factor-password"
				name="current-password"
				icon={PasswordIcon}
				placeholder="Password"
				ariaLabel="Password"
				type="password"
				autoComplete="current-password"
				value={password}
				onChange={(next) => {
					setPassword(next);
					setWarning("");
				}}
				onSubmit={() => void run()}
			/>
			<LUINote>{explanation[action]}</LUINote>
			{action === "add" && !webAuthnAvailable() ? (
				<LUINote warning>
					This browser can't use security keys here.
				</LUINote>
			) : null}
			{warning !== "" ? <LUINote warning>{warning}</LUINote> : null}
			<LUICUButton
				name={actionName[action]}
				onClick={run}
				disabled={action === "add" && !webAuthnAvailable()}
			/>
		</LUIIdentityPage>,
	);
};

export { Page as LUITwoFactorAction };
