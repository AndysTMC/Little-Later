import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	statSync,
	unlinkSync,
} from "node:fs";
import { createServer, type Socket } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const NATIVE_HOST_NAME = "com.littlelater.mcp";
const MAX_NATIVE_MESSAGE_BYTES = 64 * 1024 * 1024;
export const MAX_SOCKET_LINE_BYTES = 1024 * 1024;
export const MAX_CONCURRENT_PENDING = 64;
const SOCKET_REQUEST_TIMEOUT_MS = 15_000;

export type PendingBridgeEntry = {
	socket: Socket;
	timeout: ReturnType<typeof setTimeout>;
};

export const attachBridgeSocket = (
	socket: Socket,
	options: {
		pending: Map<string, PendingBridgeEntry>;
		writeToChrome: (payload: unknown) => void;
		maxLineBytes?: number;
		maxConcurrentPending?: number;
		requestTimeoutMs?: number;
	},
): void => {
	const {
		pending,
		writeToChrome,
		maxLineBytes = MAX_SOCKET_LINE_BYTES,
		maxConcurrentPending = MAX_CONCURRENT_PENDING,
		requestTimeoutMs = SOCKET_REQUEST_TIMEOUT_MS,
	} = options;
	let lineBuffer = "";
	const dropSocketPending = () => {
		for (const [bridgeId, entry] of pending) {
			if (entry.socket === socket) {
				clearTimeout(entry.timeout);
				pending.delete(bridgeId);
			}
		}
	};
	const rejectOversized = () => {
		lineBuffer = "";
		if (!socket.destroyed) {
			socket.end(
				`${JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: {
						code: -32600,
						message: "Request exceeds maximum size.",
					},
				})}\n`,
			);
			socket.destroy();
		}
	};
	socket.on("error", dropSocketPending);
	socket.on("close", dropSocketPending);
	socket.on("data", (chunk: Buffer) => {
		if (socket.destroyed) return;
		const chunkText = chunk.toString("utf8");
		// Reject unbounded unterminated input before splitting.
		if (
			!chunkText.includes("\n") &&
			Buffer.byteLength(lineBuffer, "utf8") + chunk.byteLength >
				maxLineBytes
		) {
			rejectOversized();
			return;
		}
		lineBuffer += chunkText;
		const lines = lineBuffer.split("\n");
		lineBuffer = lines.pop() ?? "";
		if (Buffer.byteLength(lineBuffer, "utf8") > maxLineBytes) {
			rejectOversized();
			return;
		}
		for (const line of lines) {
			if (Buffer.byteLength(line, "utf8") > maxLineBytes) {
				rejectOversized();
				return;
			}
			const trimmed = line.trim();
			if (trimmed === "") continue;
			let request: unknown;
			try {
				request = JSON.parse(trimmed);
			} catch {
				if (!socket.destroyed) {
					socket.write(
						`${JSON.stringify({
							jsonrpc: "2.0",
							id: null,
							error: {
								code: -32700,
								message: "Parse error: invalid JSON.",
							},
						})}\n`,
					);
				}
				continue;
			}
			const reqObj =
				request && typeof request === "object"
					? (request as {
							id?: string | number | null;
							method?: unknown;
						})
					: null;
			const isNotification =
				!reqObj ||
				reqObj.id === undefined ||
				(typeof reqObj.method === "string" &&
					reqObj.method.startsWith("notifications/"));
			const bridgeId = randomUUID();
			if (isNotification) {
				writeToChrome({ bridgeId, request });
				continue;
			}
			if (pending.size >= maxConcurrentPending) {
				if (!socket.destroyed) {
					socket.write(
						`${JSON.stringify({
							jsonrpc: "2.0",
							id: reqObj.id ?? null,
							error: {
								code: -32003,
								message: "Too many concurrent requests.",
							},
						})}\n`,
					);
				}
				continue;
			}
			const timeout = setTimeout(() => {
				pending.delete(bridgeId);
				if (!socket.destroyed) {
					socket.write(
						`${JSON.stringify({
							jsonrpc: "2.0",
							id: reqObj.id ?? null,
							error: {
								code: -32002,
								message:
									"Little Later did not respond in time.",
							},
						})}\n`,
					);
				}
			}, requestTimeoutMs);
			pending.set(bridgeId, { socket, timeout });
			writeToChrome({ bridgeId, request });
		}
	});
};

export const getBridgeEndpoint = (): string => {
	if (process.platform === "win32") {
		return "\\\\.\\pipe\\little-later-mcp";
	}
	// Avoid XDG_RUNTIME_DIR: MCP clients (e.g. Codex, Claude Desktop) often
	// strip session env vars when spawning stdio servers, which would cause
	// host and client to resolve different socket paths.
	return join(homedir(), ".local", "share", "little-later", "mcp.sock");
};

// Chrome Native Messaging framing: 4-byte little-endian uint32 length + UTF-8 JSON.
export const encodeNativeMessage = (payload: unknown): Buffer => {
	const body = Buffer.from(JSON.stringify(payload), "utf8");
	const header = Buffer.alloc(4);
	header.writeUInt32LE(body.length, 0);
	return Buffer.concat([header, body]);
};

export const startNativeHost = (): void => {
	const endpoint = getBridgeEndpoint();
	if (process.platform !== "win32") {
		mkdirSync(dirname(endpoint), { recursive: true, mode: 0o700 });
		if (existsSync(endpoint)) {
			try {
				unlinkSync(endpoint);
			} catch {
				// Ignore stale socket cleanup failures.
			}
		}
	}

	const pending = new Map<string, PendingBridgeEntry>();

	const writeToChrome = (payload: unknown) => {
		process.stdout.write(encodeNativeMessage(payload));
	};

	// Read length-prefixed JSON replies coming back from the extension worker.
	let chromeBuffer: Buffer = Buffer.alloc(0);
	process.stdin.on("data", (chunk: Buffer) => {
		chromeBuffer = Buffer.concat([chromeBuffer, chunk]);
		while (chromeBuffer.length >= 4) {
			const messageLength = chromeBuffer.readUInt32LE(0);
			if (messageLength > MAX_NATIVE_MESSAGE_BYTES) {
				chromeBuffer = Buffer.alloc(0);
				break;
			}
			if (chromeBuffer.length < 4 + messageLength) {
				break;
			}
			const jsonBytes = chromeBuffer.subarray(4, 4 + messageLength);
			chromeBuffer = chromeBuffer.subarray(4 + messageLength);
			try {
				const envelope = JSON.parse(jsonBytes.toString("utf8")) as {
					bridgeId?: string;
					response?: unknown;
				};
				if (envelope.bridgeId && pending.has(envelope.bridgeId)) {
					const entry = pending.get(envelope.bridgeId)!;
					pending.delete(envelope.bridgeId);
					clearTimeout(entry.timeout);
					if (!entry.socket.destroyed) {
						entry.socket.write(
							`${JSON.stringify(envelope.response)}\n`,
						);
					}
				}
			} catch {
				// Ignore malformed frames.
			}
		}
	});

	const server = createServer((socket) => {
		attachBridgeSocket(socket, { pending, writeToChrome });
	});

	server.on("error", () => {
		process.exit(1);
	});

	let ownSocketIno: number | null = null;
	server.listen(endpoint, () => {
		if (process.platform !== "win32") {
			try {
				chmodSync(endpoint, 0o600);
			} catch {
				// Ignore permission change errors on unsupported filesystems.
			}
			try {
				ownSocketIno = statSync(endpoint).ino;
			} catch {
				ownSocketIno = null;
			}
		}
	});

	const cleanup = () => {
		server.close();
		if (process.platform !== "win32" && existsSync(endpoint)) {
			try {
				// Only unlink if the socket file is still the one this process
				// created, so a shutting-down host never deletes a restarted
				// host's live socket.
				if (
					ownSocketIno === null ||
					statSync(endpoint).ino === ownSocketIno
				) {
					unlinkSync(endpoint);
				}
			} catch {
				// Ignore cleanup errors.
			}
		}
		process.exit(0);
	};

	process.stdin.on("end", cleanup);
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
};
