import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const NATIVE_HOST_NAME = "com.littlelater.mcp";

export const getBridgeEndpoint = (): string => {
	if (process.platform === "win32") {
		return "\\\\.\\pipe\\little-later-mcp";
	}
	const runtimeDir = process.env.XDG_RUNTIME_DIR;
	if (runtimeDir) {
		return join(runtimeDir, "little-later-mcp.sock");
	}
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

	const pending = new Map<
		string,
		{ socket: Socket; timeout: ReturnType<typeof setTimeout> }
	>();

	const writeToChrome = (payload: unknown) => {
		process.stdout.write(encodeNativeMessage(payload));
	};

	// Read length-prefixed JSON replies coming back from the extension worker.
	let chromeBuffer: Buffer = Buffer.alloc(0);
	process.stdin.on("data", (chunk: Buffer) => {
		chromeBuffer = Buffer.concat([chromeBuffer, chunk]);
		while (chromeBuffer.length >= 4) {
			const messageLength = chromeBuffer.readUInt32LE(0);
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
		let lineBuffer = "";
		socket.on("data", (chunk: Buffer) => {
			lineBuffer += chunk.toString("utf8");
			const lines = lineBuffer.split("\n");
			lineBuffer = lines.pop() ?? "";
			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed === "") continue;
				let request: unknown;
				try {
					request = JSON.parse(trimmed);
				} catch {
					continue;
				}
				const bridgeId = randomUUID();
				const timeout = setTimeout(() => {
					pending.delete(bridgeId);
					if (!socket.destroyed) {
						socket.write(
							`${JSON.stringify({
								jsonrpc: "2.0",
								id:
									(request as { id?: string | number | null })
										.id ?? null,
								error: {
									code: -32002,
									message:
										"Little Later did not respond in time.",
								},
							})}\n`,
						);
					}
				}, 15_000);
				pending.set(bridgeId, { socket, timeout });
				writeToChrome({ bridgeId, request });
			}
		});
	});

	server.listen(endpoint, () => {
		if (process.platform !== "win32") {
			try {
				chmodSync(endpoint, 0o600);
			} catch {
				// Ignore permission change errors on unsupported filesystems.
			}
		}
	});

	const cleanup = () => {
		server.close();
		if (process.platform !== "win32" && existsSync(endpoint)) {
			try {
				unlinkSync(endpoint);
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
