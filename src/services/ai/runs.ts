import { LFACE_EXPRESSION } from "little-shared/enums";
import { littleDB } from "../../storage/pageDB";
import {
	listChatMessages,
	MAX_ANSWER_TEXT,
	type StoredAIOutput,
} from "../../storage/repositories";
import {
	LittleAI,
	RunStoppedError,
	sameConnection,
	type AIConnection,
	type AIOutput,
} from "./main";
import { ProfileChangedError, type AIOwner } from "./owner";
import { sessionStore } from "../../storage/session";
import { send } from "../../utils/send";
import { RunError, runStatusStore } from "./runStatus";
import { stepDoing, stepDone } from "./steps";
import { pageAttachment, readPage, type PageRef } from "./pages";

// LittleAI's runs (decision 0017). A run answers one message in a chat, or
// carries out what the user confirmed. It belongs to the worker, not to
// the side panel: closing the panel doesn't stop it, and its answer is
// stored as a chat message for whichever view is open. A lock ends it
// (owner.ts); Stop drops it.

export { RunError };

type ChatClient = {
	unlockId: string;
	connection: AIConnection;
	client: LittleAI;
};

// One client per chat, holding the conversation the provider sees and
// anything waiting for confirmation. A worker restart or a change of
// provider loses it; it is then rebuilt from the stored messages, and what
// was waiting has to be asked again.
const clients = new Map<string, ChatClient>();
const active = new Map<string, AbortController>();
// The unlock each active run belongs to.
const activeUnlock = new Map<string, string>();

// A lock, or another profile opening, ends that unlock's runs at once:
// their provider requests are cancelled rather than left to finish, and
// the conversations they held are let go (owner.ts).
let watchingSession = false;
const watchSession = () => {
	if (watchingSession) return;
	watchingSession = true;
	sessionStore.subscribe((session) => {
		for (const [chatId, unlockId] of activeUnlock) {
			if (unlockId !== session?.unlockId) active.get(chatId)?.abort();
		}
		for (const [chatId, cached] of clients) {
			if (cached.unlockId !== session?.unlockId) clients.delete(chatId);
		}
	});
};

// Chrome suspends an idle worker. While a run is active, an extension call
// every 20 seconds counts as activity, so the run can finish.
const HEARTBEAT_MS = 20_000;
let heartbeat: ReturnType<typeof setInterval> | null = null;
const keepAlive = () => {
	const canPing =
		typeof chrome !== "undefined" &&
		typeof chrome.runtime?.getPlatformInfo === "function";
	if (active.size > 0 && heartbeat === null && canPing) {
		heartbeat = setInterval(() => {
			void chrome.runtime.getPlatformInfo();
		}, HEARTBEAT_MS);
	} else if (active.size === 0 && heartbeat !== null) {
		clearInterval(heartbeat);
		heartbeat = null;
	}
};

export const isRunning = (chatId: string): boolean => active.has(chatId);

// Runs the worker lost when Chrome stopped it: each chat gets an answer
// saying so, with what the run had done, so the user knows where it got
// to before asking again. A chat of a locked profile is left as it is.
export const recoverInterrupted = async (): Promise<void> => {
	for (const [chatId, status] of await runStatusStore.takeAll(
		new Set(active.keys()),
	)) {
		if (active.has(chatId)) continue;
		await send("chat.addMessage", {
			chatId,
			message: {
				role: "assistant",
				output: {
					message:
						"Interrupted: Chrome stopped Little AI before it finished. What it had done is listed above; ask again to carry on.",
					expression: LFACE_EXPRESSION.FROWNING,
					...(status.steps.length > 0 ? { steps: status.steps } : {}),
				},
			},
		}).catch(() => undefined);
	}
};

const SHORTENED = "\n\n(The answer was shortened to fit.)";

// What is stored of an answer: plain data only, its text within what a
// chat (and a backup of it) keeps.
const toStored = (
	output: AIOutput,
	undo: StoredAIOutput["undo"] | null,
	steps: ReadonlyArray<string>,
): StoredAIOutput =>
	JSON.parse(
		JSON.stringify({
			message:
				output.message.length > MAX_ANSWER_TEXT
					? output.message.slice(
							0,
							MAX_ANSWER_TEXT - SHORTENED.length,
						) + SHORTENED
					: output.message,
			expression: output.expression,
			confirmation: output.confirmation,
			question: output.question,
			undo: undo ?? undefined,
			steps: steps.length > 0 ? steps : undefined,
		}),
	) as StoredAIOutput;

const STAGES: Record<string, string> = {
	preparing: "Preparing",
	reasoning: "Thinking",
	tool: "Running a tool",
	finalizing: "Finishing",
};

// The chat's client for this unlock and the provider set up now; a new
// one picks up the stored conversation, all but its newest message, which
// the run is about.
const clientFor = async (
	chatId: string,
	owner: AIOwner,
	continuing: boolean,
): Promise<LittleAI> => {
	const connection = await LittleAI.connectionOf(owner);
	const cached = clients.get(chatId);
	if (
		cached &&
		cached.unlockId === owner.unlockId &&
		sameConnection(cached.connection, connection)
	) {
		return cached.client;
	}
	clients.delete(chatId);
	if (continuing) {
		throw new RunError(
			"This request expired when Little AI restarted or its AI settings changed. Ask again.",
		);
	}
	const client = await LittleAI.getLAIAssistInstance(owner, connection);
	const messages = await listChatMessages(
		littleDB,
		await owner.keys(),
		chatId,
	);
	client.restore(
		messages.slice(0, -1).map((message) =>
			message.role === "user"
				? { role: "user" as const, content: message.text }
				: {
						role: "assistant" as const,
						content: message.output.message,
					},
		),
	);
	clients.set(chatId, { unlockId: owner.unlockId, connection, client });
	return client;
};

// `onStage` reports what the run is doing; given a tool, it also marks the
// previous tool done and starts this one.
type Work = (
	client: LittleAI,
	onStage: (stage: string, tool?: string) => void,
) => Promise<AIOutput>;

// Starts a run and returns at once; the run reports through the chat and
// its status. `continuing` work needs the client that asked for it.
const begin = (
	chatId: string,
	owner: AIOwner,
	work: Work,
	continuing = false,
): void => {
	if (active.has(chatId)) {
		throw new RunError("Little AI is still answering in this chat.");
	}
	const controller = new AbortController();
	active.set(chatId, controller);
	activeUnlock.set(chatId, owner.unlockId);
	watchSession();
	keepAlive();
	const startedAt = Date.now();
	// Tools in the order they ran; the last is still running until the next
	// stage arrives.
	const tools: Array<string> = [];
	const done = () => tools.map(stepDone);
	let current = "Preparing";
	let draft = "";
	let flushTimer: ReturnType<typeof setTimeout> | null = null;
	// Serialise status writes so an in-flight publish can never resolve after
	// `finally` clears the status to null.
	let statusWrite: Promise<void> = Promise.resolve();
	const publish = () => {
		flushTimer = null;
		if (!active.has(chatId)) return;
		const next = {
			stage: current,
			// The tool in progress isn't done yet.
			steps:
				tools.length > 0 && current === stepDoing(tools.at(-1)!)
					? done().slice(0, -1)
					: done(),
			...(draft !== "" ? { draft } : {}),
			startedAt,
		};
		statusWrite = statusWrite
			.then(() => runStatusStore.set(chatId, next))
			.catch(() => undefined);
	};
	const stage = (name: string, tool?: string) => {
		if (tool) {
			tools.push(tool);
			// Words before a tool call are its preamble, not the answer.
			draft = "";
		}
		current = tool ? stepDoing(tool) : name;
		publish();
	};
	// The streamed answer reaches the panel a few times a second, not on
	// every token.
	const onText = (text: string) => {
		draft += text;
		flushTimer ??= setTimeout(publish, 120);
	};
	const onReset = () => {
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		draft = "";
		publish();
	};
	const answer = (output: StoredAIOutput) =>
		owner
			.send("chat.addMessage", {
				chatId,
				message: { role: "assistant", output },
			})
			.then(() => undefined);
	void (async () => {
		let client: LittleAI | null = null;
		try {
			stage("Preparing");
			client = await clientFor(chatId, owner, continuing);
			client.setStopSignal(controller.signal);
			client.setTextListener(onText, onReset);
			const output = await work(client, stage);
			if (controller.signal.aborted) throw new RunStoppedError();
			await answer(toStored(output, client.turnUndoInfo(), done()));
		} catch (error) {
			// Locked or switched: nothing more may be written for it.
			if (error instanceof ProfileChangedError) return;
			const stopped =
				controller.signal.aborted || error instanceof RunStoppedError;
			await answer({
				message: stopped
					? "Stopped."
					: error instanceof Error && error.message
						? error.message
						: "Something went wrong. Try again.",
				expression: stopped
					? LFACE_EXPRESSION.SLIGHTLY_SMILING
					: LFACE_EXPRESSION.FROWNING,
			}).catch(() => undefined);
		} finally {
			if (flushTimer) clearTimeout(flushTimer);
			client?.setStopSignal(null);
			client?.setTextListener(null);
			active.delete(chatId);
			activeUnlock.delete(chatId);
			keepAlive();
			await statusWrite;
			await runStatusStore.set(chatId, null);
		}
	})();
};

// Answers the newest message of a chat, already stored, reading the page
// attached to it first.
export const ask = (
	chatId: string,
	owner: AIOwner,
	text: string,
	page: PageRef | null = null,
): void =>
	begin(chatId, owner, async (client, onStage) => {
		let attachment: string | undefined;
		if (page) {
			onStage("Reading the page");
			const content = await readPage(page);
			// The step says whether all of the page fitted.
			onStage(
				"Reading the page",
				content.shortened ? "read_page_part" : "read_page",
			);
			attachment = pageAttachment(content);
		}
		return client.prompt(text, {
			attachment,
			onProgress: (progress) =>
				onStage(
					STAGES[progress.stage] ?? progress.message,
					progress.stage === "tool" ? progress.toolName : undefined,
				),
		});
	});

export const confirm = (
	chatId: string,
	owner: AIOwner,
	password: string | null,
): void =>
	begin(
		chatId,
		owner,
		async (client) => {
			if (!client.hasPendingConfirmation()) {
				throw new RunError("Nothing is waiting for confirmation.");
			}
			return client.confirmPendingMutations(
				password === null ? undefined : { password },
			);
		},
		true,
	);

export const cancel = (chatId: string, owner: AIOwner): void =>
	begin(chatId, owner, (client) => client.cancelPendingMutations(), true);

export const undo = (chatId: string, owner: AIOwner): void =>
	begin(chatId, owner, (client) => client.undoLastAction(), true);

export const stop = (chatId: string): void => {
	active.get(chatId)?.abort();
};

// A deleted chat takes its client with it.
export const forget = (chatId: string): void => {
	active.get(chatId)?.abort();
	clients.delete(chatId);
};
