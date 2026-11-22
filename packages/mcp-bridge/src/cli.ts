#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
	NATIVE_HOST_NAME,
	getBridgeEndpoint,
	startNativeHost,
} from "./nativeHost";

const getChromeNativeHostDir = (): string => {
	if (process.platform === "darwin") {
		return join(
			homedir(),
			"Library",
			"Application Support",
			"Google",
			"Chrome",
			"NativeMessagingHosts",
		);
	}
	if (process.platform === "win32") {
		return join(
			process.env.LOCALAPPDATA ?? homedir(),
			"LittleLater",
			"NativeMessagingHosts",
		);
	}
	return join(homedir(), ".config", "google-chrome", "NativeMessagingHosts");
};

const installManifest = (extensionId: string): void => {
	if (!/^[a-p]{32}$/i.test(extensionId)) {
		console.error(
			"Invalid Chrome extension ID. Expected a 32-character ID from chrome://extensions.",
		);
		process.exit(1);
	}
	const hostDir = getChromeNativeHostDir();
	mkdirSync(hostDir, { recursive: true });
	const wrapperPath = join(
		hostDir,
		process.platform === "win32"
			? `${NATIVE_HOST_NAME}.cmd`
			: `${NATIVE_HOST_NAME}.sh`,
	);
	const cliPath = resolve(import.meta.filename);
	const wrapperScript =
		process.platform === "win32"
			? `@echo off\r\nbun "${cliPath}" host\r\n`
			: `#!/usr/bin/env sh\nexec bun "${cliPath}" host\n`;
	writeFileSync(wrapperPath, wrapperScript, { mode: 0o755 });

	const manifestPath = join(hostDir, `${NATIVE_HOST_NAME}.json`);
	const manifest = {
		name: NATIVE_HOST_NAME,
		description: "Little Later local MCP bridge",
		path: wrapperPath,
		type: "stdio",
		allowed_origins: [`chrome-extension://${extensionId.toLowerCase()}/`],
	};
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
		mode: 0o644,
	});
	console.log(`Installed Chrome Native Messaging host manifest:`);
	console.log(`  ${manifestPath}`);
};

// Standard MCP stdio server forwarding JSON-RPC lines to the running native
// host IPC endpoint.
const startStdioServer = (): void => {
	const endpoint = getBridgeEndpoint();
	let stdinBuffer = "";

	const sendToHost = (line: string) => {
		const socket = createConnection(endpoint);
		let replyBuffer = "";
		let settled = false;

		socket.on("connect", () => {
			socket.write(`${line}\n`);
		});
		socket.on("data", (chunk: Buffer) => {
			replyBuffer += chunk.toString("utf8");
			const newline = replyBuffer.indexOf("\n");
			if (newline !== -1 && !settled) {
				settled = true;
				const reply = replyBuffer.slice(0, newline);
				process.stdout.write(`${reply}\n`);
				socket.end();
			}
		});
		socket.on("error", () => {
			if (settled) return;
			settled = true;
			let id: string | number | null = null;
			try {
				id =
					(JSON.parse(line) as { id?: string | number | null }).id ??
					null;
			} catch {
				// Ignore parse error.
			}
			process.stdout.write(
				`${JSON.stringify({
					jsonrpc: "2.0",
					id,
					error: {
						code: -32001,
						message:
							"Cannot reach Little Later. Open Chrome, unlock your profile, and enable External agent MCP in Security Settings.",
					},
				})}\n`,
			);
		});
	};

	process.stdin.on("data", (chunk: Buffer) => {
		stdinBuffer += chunk.toString("utf8");
		const lines = stdinBuffer.split(/\r?\n/);
		stdinBuffer = lines.pop() ?? "";
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed !== "") {
				sendToHost(trimmed);
			}
		}
	});
};

const [, , command, arg] = process.argv;

if (command === "host") {
	startNativeHost();
} else if (command === "serve") {
	startStdioServer();
} else if (command === "install" && arg) {
	installManifest(arg);
} else {
	console.error(
		"Usage:\n  little-later-mcp install <chrome-extension-id>\n  little-later-mcp serve\n  little-later-mcp host",
	);
	process.exit(1);
}
