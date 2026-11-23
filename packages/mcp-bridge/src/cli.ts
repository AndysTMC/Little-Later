#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	NATIVE_HOST_NAME,
	getBridgeEndpoint,
	startNativeHost,
} from "./nativeHost";

// Fixed extension ID derived from Little Later's release signing key.
export const OFFICIAL_EXTENSION_ID = "nchfnpignmgklabjemdobnanfickfbhl";
const CLI_VERSION = "3.1.0";

const getAppDataDir = (): string => {
	if (process.platform === "darwin") {
		return join(homedir(), "Library", "Application Support", "LittleLater");
	}
	if (process.platform === "win32") {
		return join(process.env.LOCALAPPDATA ?? homedir(), "LittleLater");
	}
	return join(homedir(), ".local", "share", "little-later");
};

const getNativeHostDirs = (): { primary: string; extras: Array<string> } => {
	if (process.platform === "darwin") {
		const base = join(homedir(), "Library", "Application Support");
		return {
			primary: join(base, "Google", "Chrome", "NativeMessagingHosts"),
			extras: [
				join(base, "Google", "Chrome Beta", "NativeMessagingHosts"),
				join(base, "Google", "Chrome Canary", "NativeMessagingHosts"),
				join(base, "Chromium", "NativeMessagingHosts"),
				join(
					base,
					"BraveSoftware",
					"Brave-Browser",
					"NativeMessagingHosts",
				),
				join(base, "Microsoft Edge", "NativeMessagingHosts"),
				join(base, "Vivaldi", "NativeMessagingHosts"),
			],
		};
	}
	if (process.platform === "win32") {
		return {
			primary: join(getAppDataDir(), "NativeMessagingHosts"),
			extras: [],
		};
	}
	const config = join(homedir(), ".config");
	return {
		primary: join(config, "google-chrome", "NativeMessagingHosts"),
		extras: [
			join(config, "google-chrome-beta", "NativeMessagingHosts"),
			join(config, "google-chrome-unstable", "NativeMessagingHosts"),
			join(config, "chromium", "NativeMessagingHosts"),
			join(
				config,
				"BraveSoftware",
				"Brave-Browser",
				"NativeMessagingHosts",
			),
			join(config, "microsoft-edge", "NativeMessagingHosts"),
			join(config, "vivaldi", "NativeMessagingHosts"),
			join(
				homedir(),
				"snap",
				"chromium",
				"common",
				"chromium",
				"NativeMessagingHosts",
			),
			join(
				homedir(),
				".var",
				"app",
				"com.google.Chrome",
				"config",
				"google-chrome",
				"NativeMessagingHosts",
			),
		],
	};
};

const WINDOWS_REGISTRY_KEYS = [
	`HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
	`HKCU\\Software\\Chromium\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
	`HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
	`HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`,
];

const getCurrentScriptPath = (): string | null => {
	try {
		const url = import.meta.url;
		if (!url || !url.startsWith("file://")) return null;
		const path = fileURLToPath(url);
		if (path.includes("$bunfs") || path.startsWith("/$bunfs")) {
			return null;
		}
		return resolve(path);
	} catch {
		return null;
	}
};

const isCompiledBinary = (scriptPath: string | null): boolean => {
	if (!scriptPath) return true;
	const execPath = resolve(process.execPath);
	return execPath === scriptPath;
};

const shellQuote = (value: string): string =>
	`'${value.replace(/'/g, "'\\''")}'`;

const buildPosixRuntimeLauncher = (
	runtimePath: string,
	installedScript: string,
): string => {
	// Prefer stable symlinks (which survive brew/nvm upgrades) and fall back to
	// the exact runtime used at install time or PATH.
	const candidates = Array.from(
		new Set([
			runtimePath,
			"/opt/homebrew/bin/node",
			"/usr/local/bin/node",
			"/home/linuxbrew/.linuxbrew/bin/node",
			"/usr/bin/node",
		]),
	);
	const quotedScript = shellQuote(installedScript);
	const lines = [
		"#!/usr/bin/env sh",
		`for bin in ${candidates.map(shellQuote).join(" ")}; do`,
		'  if [ -x "$bin" ]; then',
		`    exec "$bin" ${quotedScript} host`,
		"  fi",
		"done",
		`exec node ${quotedScript} host`,
	];
	return `${lines.join("\n")}\n`;
};

const installManifest = (extensionIds: Array<string>): void => {
	const normalizedIds = Array.from(
		new Set(extensionIds.map((id) => id.trim().toLowerCase())),
	).filter(Boolean);
	if (
		normalizedIds.length === 0 ||
		normalizedIds.some((id) => !/^[a-p]{32}$/.test(id))
	) {
		console.error(
			"Invalid Chrome extension ID. Expected a 32-character ID from chrome://extensions.",
		);
		process.exit(1);
	}

	const appDir = getAppDataDir();
	mkdirSync(appDir, { recursive: true, mode: 0o700 });

	const scriptPath = getCurrentScriptPath();
	const compiled = isCompiledBinary(scriptPath);
	const isWindows = process.platform === "win32";

	let wrapperScript: string;
	if (compiled) {
		const targetBin = join(
			appDir,
			isWindows ? "little-later-mcp.exe" : "little-later-mcp",
		);
		if (resolve(process.execPath) !== resolve(targetBin)) {
			copyFileSync(process.execPath, targetBin);
			if (!isWindows) {
				chmodSync(targetBin, 0o755);
			}
		}
		wrapperScript = isWindows
			? `@echo off\r\n"${targetBin}" host\r\n`
			: `#!/usr/bin/env sh\nexec ${shellQuote(targetBin)} host\n`;
	} else {
		const ext = extname(scriptPath!);
		let installedScript = scriptPath!;
		// Copy bundled JS (.mjs/.js/.cjs) into stable app-data so Chrome never
		// depends on a temporary npx cache or a deleted download folder.
		if (ext === ".mjs" || ext === ".js" || ext === ".cjs") {
			installedScript = join(appDir, `mcp-bridge${ext}`);
			if (resolve(scriptPath!) !== resolve(installedScript)) {
				copyFileSync(scriptPath!, installedScript);
			}
		}
		const runtimePath = resolve(process.execPath);
		wrapperScript = isWindows
			? `@echo off\r\n"${runtimePath}" "${installedScript}" host\r\n`
			: buildPosixRuntimeLauncher(runtimePath, installedScript);
	}

	const wrapperPath = join(
		appDir,
		isWindows ? `${NATIVE_HOST_NAME}.cmd` : `${NATIVE_HOST_NAME}.sh`,
	);
	writeFileSync(wrapperPath, wrapperScript, { mode: 0o755 });
	if (!isWindows) {
		chmodSync(wrapperPath, 0o755);
	}

	const manifest = {
		name: NATIVE_HOST_NAME,
		description: "Little Later local MCP bridge",
		path: wrapperPath,
		type: "stdio",
		allowed_origins: normalizedIds.map((id) => `chrome-extension://${id}/`),
	};
	const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;

	const { primary, extras } = getNativeHostDirs();
	const targets = [primary];
	for (const dir of extras) {
		if (existsSync(dirname(dir))) {
			targets.push(dir);
		}
	}

	const installedManifests: Array<string> = [];
	for (const hostDir of targets) {
		mkdirSync(hostDir, { recursive: true });
		const manifestPath = join(hostDir, `${NATIVE_HOST_NAME}.json`);
		writeFileSync(manifestPath, manifestBody, { mode: 0o644 });
		installedManifests.push(manifestPath);
	}

	if (isWindows) {
		const manifestPath = join(primary, `${NATIVE_HOST_NAME}.json`);
		for (const regKey of WINDOWS_REGISTRY_KEYS) {
			try {
				execFileSync(
					"reg",
					[
						"add",
						regKey,
						"/ve",
						"/t",
						"REG_SZ",
						"/d",
						manifestPath,
						"/f",
					],
					{ stdio: "ignore" },
				);
			} catch {
				// Ignore browsers not configured or restricted registry writes.
			}
		}
	}

	console.log("Installed Little Later Native Messaging host:");
	for (const path of installedManifests) {
		console.log(`  ${path}`);
	}
	console.log(`  Host launcher: ${wrapperPath}`);
};

const uninstallManifest = (): void => {
	const { primary, extras } = getNativeHostDirs();
	const removed: Array<string> = [];
	for (const hostDir of [primary, ...extras]) {
		const manifestPath = join(hostDir, `${NATIVE_HOST_NAME}.json`);
		if (existsSync(manifestPath)) {
			rmSync(manifestPath, { force: true });
			removed.push(manifestPath);
		}
	}
	const appDir = getAppDataDir();
	for (const name of [
		`${NATIVE_HOST_NAME}.sh`,
		`${NATIVE_HOST_NAME}.cmd`,
		"mcp-bridge.mjs",
		"mcp-bridge.js",
		"mcp-bridge.cjs",
	]) {
		const filePath = join(appDir, name);
		if (existsSync(filePath)) {
			rmSync(filePath, { force: true });
			removed.push(filePath);
		}
	}
	if (process.platform === "win32") {
		for (const regKey of WINDOWS_REGISTRY_KEYS) {
			try {
				execFileSync("reg", ["delete", regKey, "/f"], {
					stdio: "ignore",
				});
			} catch {
				// Ignore missing registry keys.
			}
		}
	}
	if (removed.length === 0) {
		console.log("No Little Later Native Messaging host files found.");
	} else {
		console.log("Removed Little Later Native Messaging host files:");
		for (const path of removed) {
			console.log(`  ${path}`);
		}
	}
};

const checkStatus = (): void => {
	const endpoint = getBridgeEndpoint();
	const socket = createConnection(endpoint);
	let settled = false;
	const timer = setTimeout(() => {
		if (settled) return;
		settled = true;
		socket.destroy();
		console.error("Timed out waiting for Little Later.");
		process.exit(1);
	}, 3_000);

	socket.on("connect", () => {
		socket.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`,
		);
	});
	let buffer = "";
	socket.on("data", (chunk: Buffer) => {
		buffer += chunk.toString("utf8");
		const newline = buffer.indexOf("\n");
		if (newline !== -1 && !settled) {
			settled = true;
			clearTimeout(timer);
			socket.end();
			console.log(`Connected to Little Later (${endpoint}).`);
			process.exit(0);
		}
	});
	socket.on("error", () => {
		if (settled) return;
		settled = true;
		clearTimeout(timer);
		console.error(
			"Cannot reach Little Later. Make sure Chrome is open, your profile is unlocked, External agent MCP is enabled in Settings -> Data & Privacy, and the native host is installed.",
		);
		process.exit(1);
	});
};

export const isJsonRpcNotification = (line: string): boolean => {
	try {
		const parsed = JSON.parse(line) as { id?: unknown; method?: unknown };
		if (parsed && typeof parsed === "object") {
			if (parsed.id === undefined) return true;
			if (
				typeof parsed.method === "string" &&
				parsed.method.startsWith("notifications/")
			) {
				return true;
			}
		}
	} catch {
		// Fall through to let the host report a parse error if needed.
	}
	return false;
};

// Standard MCP stdio server forwarding JSON-RPC lines to the running native
// host IPC endpoint.
export const startStdioServer = (
	endpoint = getBridgeEndpoint(),
	input: NodeJS.ReadableStream = process.stdin,
	output: NodeJS.WritableStream = process.stdout,
): void => {
	let stdinBuffer = "";

	const sendToHost = (line: string) => {
		// JSON-RPC 2.0 notifications (e.g. notifications/initialized) must not
		// produce a response on stdout.
		if (isJsonRpcNotification(line)) {
			return;
		}

		const socket = createConnection(endpoint);
		let replyBuffer = "";
		let settled = false;

		const emitError = (code: number, message: string) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			socket.destroy();
			let id: string | number | null = null;
			try {
				id =
					(JSON.parse(line) as { id?: string | number | null }).id ??
					null;
			} catch {
				// Ignore parse error.
			}
			output.write(
				`${JSON.stringify({
					jsonrpc: "2.0",
					id,
					error: { code, message },
				})}\n`,
			);
		};

		const timeout = setTimeout(() => {
			emitError(-32002, "Little Later did not respond in time.");
		}, 20_000);

		socket.on("connect", () => {
			socket.write(`${line}\n`);
		});
		socket.on("data", (chunk: Buffer) => {
			replyBuffer += chunk.toString("utf8");
			const newline = replyBuffer.indexOf("\n");
			if (newline !== -1 && !settled) {
				settled = true;
				clearTimeout(timeout);
				const reply = replyBuffer.slice(0, newline);
				output.write(`${reply}\n`);
				socket.end();
			}
		});
		socket.on("error", () => {
			emitError(
				-32001,
				"Cannot reach Little Later. Open Chrome, unlock your profile, and enable External agent MCP in Data & Privacy settings.",
			);
		});
		socket.on("close", () => {
			emitError(
				-32001,
				"Connection to Little Later closed before a reply arrived.",
			);
		});
	};

	input.on("data", (chunk: Buffer | string) => {
		stdinBuffer +=
			typeof chunk === "string" ? chunk : chunk.toString("utf8");
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

const USAGE = [
	"Usage:",
	"  little-later-mcp install [chrome-extension-id...]",
	"  little-later-mcp serve",
	"  little-later-mcp status",
	"  little-later-mcp uninstall",
	"  little-later-mcp --version",
].join("\n");

const runCli = (): void => {
	const [, , command, ...rest] = process.argv;

	if (command === "host") {
		startNativeHost();
	} else if (command === "serve") {
		startStdioServer();
	} else if (command === "install") {
		installManifest(rest.length > 0 ? rest : [OFFICIAL_EXTENSION_ID]);
	} else if (command === "uninstall") {
		uninstallManifest();
	} else if (command === "status") {
		checkStatus();
	} else if (command === "--version" || command === "-v") {
		console.log(CLI_VERSION);
	} else if (command === "--help" || command === "-h") {
		console.log(USAGE);
	} else {
		console.error(USAGE);
		process.exit(1);
	}
};

// Only execute CLI dispatch when invoked directly, not when imported in tests.
// Resolve symlinks via realpathSync so `npx` / `bunx` / global npm `.bin`
// shims are recognized as direct CLI invocations.
const isDirectRun = (): boolean => {
	if (process.env.VITEST) return false;
	const scriptPath = getCurrentScriptPath();
	if (!scriptPath) return true; // Compiled standalone binary
	const entry = process.argv[1];
	if (!entry) return false;
	try {
		return realpathSync(resolve(entry)) === realpathSync(scriptPath);
	} catch {
		return resolve(entry) === scriptPath;
	}
};

if (isDirectRun()) {
	runCli();
}
