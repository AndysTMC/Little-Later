import { motion } from "framer-motion";
import { MOTION } from "../../../route-transitions";
import { useParams } from "react-router";
import { useMemo, useState } from "react";
import { LockIcon, PasswordIcon } from "@phosphor-icons/react";
import { usePageMotion } from "../../hooks/usePageMove";
import { useTheme } from "../../hooks/useTheme";
import { LTHEME } from "little-shared/enums";
import {
	useLinks,
	useNotes,
	useProfileTags,
	useReminders,
	useSaves,
	useTasks,
} from "../../hooks/useRecords";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";
import { useLoading } from "../../hooks/useLoading";
import { LUILoading } from "../../components/LUILoading/Component";
import { LUIBasicNav } from "../../components/LUINavs/LUIBasicNav/Component";
import { LUINoteDetailForm } from "../../components/LUINoteDetailForm/Component";
import { LUIEmptyState } from "../../components/LUIEmptyState/Component";
import { LUIIconField } from "../../components/LUIIconField/Component";
import { LUICUButton } from "../../components/LUICUButton/Component";
import { LUINote as LUINoteCallout } from "../../components/LUINote/Component";
import { LUIThemedIcon } from "../../components/LUIThemedIcon/Component";
import { send } from "../../../utils/send";

const LockedNoteGate = ({
	title,
	onUnlocked,
}: {
	title: string;
	onUnlocked: () => void;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");

	const handleUnlock = async () => {
		if (password === "") {
			return;
		}
		setError("");
		try {
			await send("profile.verifyPassword", { password });
			setPassword("");
			onUnlocked();
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Incorrect password. Please try again.",
			);
		}
	};

	return (
		<div className="mx-auto flex w-full max-w-md grow flex-col items-center justify-center gap-y-4 px-6 pb-8">
			<div
				className={`flex size-16 items-center justify-center rounded-2xl border ${
					isDark
						? "border-neutral-800 bg-neutral-900"
						: "border-neutral-200 bg-neutral-100"
				}`}
			>
				<LUIThemedIcon
					Icon={LockIcon}
					color="currentColor"
					weight="fill"
					className="size-8 text-[var(--ll-accent)]"
				/>
			</div>
			<div className="flex flex-col items-center gap-y-1 text-center">
				<h1
					className={`text-xl font-semibold tracking-tight ${
						isDark ? "text-white" : "text-black"
					}`}
				>
					{title || "Locked note"}
				</h1>
				<p
					className={`text-xs ${
						isDark ? "text-neutral-400" : "text-neutral-600"
					}`}
				>
					Enter your profile password to view this note. It locks
					again as soon as you leave.
				</p>
			</div>
			<div className="flex w-full flex-col items-center gap-y-2.5">
				<LUIIconField
					id="locked-note-password"
					icon={PasswordIcon}
					value={password}
					onChange={(value) => {
						setPassword(value);
						if (error) setError("");
					}}
					placeholder="Profile password"
					ariaLabel="Profile password"
					type="password"
					autoComplete="current-password"
					onSubmit={() => void handleUnlock()}
				/>
				{error !== "" ? (
					<LUINoteCallout warning className="w-full max-w-72">
						{error}
					</LUINoteCallout>
				) : null}
				<LUICUButton
					name="Unlock note"
					onClick={handleUnlock}
					passedTheme={theme}
					disabled={password === ""}
				/>
			</div>
		</div>
	);
};

const Page = () => {
	const { theme } = useTheme();
	const pageMotion = usePageMotion();
	const currentUserProfile = useCurrentUserProfile();
	const notes = useNotes();
	const links = useLinks();
	const pages = useSaves();
	const tasks = useTasks();
	const reminders = useReminders();
	const { id } = useParams();
	const loading = useLoading([
		id,
		currentUserProfile,
		notes,
		links,
		pages,
		tasks,
		reminders,
	]);
	// Unlocked state stays strictly in local memory and resets on unmount,
	// route change, popup close, or profile lock.
	const [unlockedId, setUnlockedId] = useState<string | null>(null);

	const note =
		id === "new"
			? { id: null, content: "", locked: false, title: "", tags: [] }
			: notes?.find((item) => item.id === id);

	const savedPages = useMemo(
		() => (pages ?? []).filter((page) => page.saved),
		[pages],
	);
	const tagSuggestions = useProfileTags();

	const needsPassword =
		note !== undefined &&
		note.id !== null &&
		note.locked &&
		unlockedId !== note.id;

	return (
		<motion.div
			className={`h-full w-full overflow-y-hidden ${theme === LTHEME.DARK ? "bg-black" : "bg-white"} `}
			{...pageMotion}
		>
			{loading ? (
				<LUILoading />
			) : (
				<motion.div
					className="flex h-full min-h-0 w-full flex-col overflow-y-hidden"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={MOTION.reveal}
				>
					<LUIBasicNav navigateTo="/home" />
					{!note ? (
						<LUIEmptyState title="Note not found." />
					) : needsPassword ? (
						<LockedNoteGate
							title={note.title ?? ""}
							onUnlocked={() => setUnlockedId(note.id)}
						/>
					) : (
						<LUINoteDetailForm
							key={note.id ?? "new"}
							note={note}
							links={links}
							saves={savedPages}
							tagSuggestions={tagSuggestions}
							canLock={Boolean(currentUserProfile?.hasPassword)}
							onLockNow={
								note.id !== null && note.locked
									? () => setUnlockedId(null)
									: undefined
							}
						/>
					)}
				</motion.div>
			)}
		</motion.div>
	);
};

export { Page as LUINote };
