import {
	MagnifyingGlassIcon,
	PencilSimpleIcon,
	XIcon,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { LTHEME } from "little-shared/enums";
import { useState } from "react";
import type { Chat } from "../storage/repositories";
import { LUIDeleteButton } from "../popup/components/LUIDeleteButton/Component";
import { useTheme } from "../popup/hooks/useTheme";
import { attempt } from "../popup/attempt";
import { send } from "../utils/send";
import { IconButton } from "./ui";

const when = (at: number) => {
	const days = Math.floor((Date.now() - at) / 86_400_000);
	if (days < 1) {
		return new Date(at).toLocaleTimeString(undefined, {
			hour: "numeric",
			minute: "2-digit",
		});
	}
	return new Date(at).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
	});
};

// One chat: open it, rename it in place, or delete it with two presses.
const ChatRow = ({
	chat,
	current,
	onOpen,
	onDeleted,
}: {
	chat: Chat;
	current: boolean;
	onOpen: () => void;
	onDeleted: () => void;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const [renaming, setRenaming] = useState<string | null>(null);
	const save = async () => {
		const title = renaming?.trim() ?? "";
		if (title !== "" && title !== chat.title) {
			await attempt(() => send("chat.rename", { id: chat.id, title }));
		}
		setRenaming(null);
	};

	if (renaming !== null) {
		return (
			<li className="px-1 py-1">
				<input
					aria-label="Chat name"
					autoFocus
					maxLength={120}
					value={renaming}
					onChange={(event) => setRenaming(event.target.value)}
					onBlur={() => void save()}
					onKeyDown={(event) => {
						if (event.nativeEvent.isComposing) return;
						if (event.key === "Enter") void save();
						if (event.key === "Escape") {
							event.stopPropagation();
							setRenaming(null);
						}
					}}
					className={`ll-field h-9 w-full rounded-xl border px-2.5 text-sm ${dark ? "border-neutral-800 bg-neutral-900 text-white" : "border-neutral-200 bg-neutral-100 text-black"}`}
				/>
			</li>
		);
	}
	return (
		<li
			className={`group flex items-center gap-x-1 rounded-xl pr-1 transition-colors ${current ? (dark ? "bg-neutral-900" : "bg-neutral-100") : dark ? "hover:bg-neutral-900/60" : "hover:bg-neutral-100/70"}`}
		>
			<button
				type="button"
				className="flex min-w-0 grow cursor-pointer flex-col items-start px-2 py-2 text-left"
				aria-current={current ? "true" : undefined}
				onClick={onOpen}
			>
				<span className="w-full truncate text-sm">{chat.title}</span>
				<span
					className={`text-xs ${dark ? "text-neutral-400" : "text-neutral-500"}`}
				>
					{when(chat.updatedAt)}
				</span>
			</button>
			{/* Shown on hover and keyboard focus. */}
			<div className="flex items-center gap-x-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 focus-within:opacity-100">
				<IconButton
					size="sm"
					label={`Rename ${chat.title}`}
					icon={PencilSimpleIcon}
					onClick={() => setRenaming(chat.title)}
				/>
				<LUIDeleteButton
					subject={`chat ${chat.title}`}
					onDelete={async () => {
						await send("chat.delete", { id: chat.id });
						onDeleted();
					}}
					failureMessage="Couldn't delete this chat."
				/>
			</div>
		</li>
	);
};

// The profile's chats, newest first, sliding in over the conversation.
const History = ({
	chats,
	currentId,
	onOpen,
	onClose,
	onDeleted,
}: {
	chats: ReadonlyArray<Chat>;
	currentId: string | null;
	onOpen: (chatId: string) => void;
	onClose: () => void;
	onDeleted: (chatId: string) => void;
}) => {
	const { theme } = useTheme();
	const dark = theme === LTHEME.DARK;
	const [query, setQuery] = useState("");
	const shown = chats.filter((chat) =>
		chat.title.toLowerCase().includes(query.trim().toLowerCase()),
	);
	return (
		<div className="absolute inset-0 z-30 flex justify-end">
			{/* The conversation behind, dimmed; a tap closes the list. */}
			<motion.button
				type="button"
				tabIndex={-1}
				aria-label="Close chats"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
				transition={{ duration: 0.16 }}
				onClick={onClose}
				className="grow cursor-default bg-black/30"
			/>
			<motion.nav
				aria-label="Chats"
				initial={{ x: "100%" }}
				animate={{ x: 0 }}
				exit={{ x: "100%" }}
				transition={{ duration: 0.2, ease: "easeOut" }}
				className={`flex h-full w-[85%] max-w-80 flex-col border-l ${dark ? "border-neutral-800 bg-black text-white" : "border-neutral-200 bg-white text-black"}`}
			>
				<div className="flex h-14 shrink-0 items-center justify-between pr-2 pl-4">
					<h2 className="text-lg font-semibold">Chats</h2>
					<IconButton
						label="Close chats"
						icon={XIcon}
						onClick={onClose}
					/>
				</div>
				<label
					className={`ll-field mx-3 mb-2 flex h-9 shrink-0 items-center gap-x-2 rounded-xl border px-2.5 ${dark ? "border-neutral-800 bg-neutral-900" : "border-neutral-200 bg-neutral-100"}`}
				>
					<MagnifyingGlassIcon
						aria-hidden
						className={`size-4 shrink-0 ${dark ? "text-neutral-400" : "text-neutral-500"}`}
					/>
					<input
						type="search"
						aria-label="Search chats"
						autoFocus
						placeholder="Search chats"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className={`min-w-0 grow bg-transparent text-sm ${dark ? "placeholder:text-neutral-400" : "placeholder:text-neutral-500"}`}
					/>
				</label>
				{shown.length === 0 ? (
					<p
						className={`px-4 py-2 text-sm ${dark ? "text-neutral-400" : "text-neutral-500"}`}
					>
						{chats.length === 0
							? "Your chats will be listed here."
							: "No chat matches."}
					</p>
				) : (
					<ul
						className={`flex flex-col gap-y-0.5 overflow-y-auto px-2 pb-4 ${theme}-scrollbar`}
					>
						{shown.map((chat) => (
							<ChatRow
								key={chat.id}
								chat={chat}
								current={chat.id === currentId}
								onOpen={() => onOpen(chat.id)}
								onDeleted={() => onDeleted(chat.id)}
							/>
						))}
					</ul>
				)}
			</motion.nav>
		</div>
	);
};

export { History };
