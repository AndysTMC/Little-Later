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
import pkg from "../package.json";

// Fixed extension ID derived from Little Later's release signing key.
export const OFFICIAL_EXTENSION_ID = "jbmjjboeppfcjblnbiiaicoakpabghom";
export const CLI_VERSION: string = pkg.version;

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
		"little-later-mcp",
		"little-later-mcp.exe",
		"mcp.sock",
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
			try {
				const reply = JSON.parse(buffer.slice(0, newline)) as {
					error?: { message?: string };
				};
				if (reply.error) {
					console.error(
						reply.error.message ??
							"Little Later rejected the status ping.",
					);
					process.exit(1);
				}
			} catch {
				// Ignore non-JSON reply.
			}
			console.log(`Connected to Little Later (${endpoint}).`);
			process.exit(0);
		}
	});
	const onUnavailable = () => {
		if (settled) return;
		settled = true;
		clearTimeout(timer);
		console.error(
			"Cannot reach Little Later. Make sure Chrome is open, your profile is unlocked, External agent MCP is enabled in Settings -> Data & Privacy, and the native host is installed.",
		);
		process.exit(1);
	};
	socket.on("error", onUnavailable);
	socket.on("close", onUnavailable);
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
	input.on("end", () => {
		const trailing = stdinBuffer.trim();
		stdinBuffer = "";
		if (trailing !== "") {
			sendToHost(trailing);
		}
	});
};

export type ParsedCliArgs = {
	positional: Array<string>;
	flags: Map<string, Array<string>>;
	booleans: Set<string>;
};

const BOOLEAN_FLAGS = new Set(["json", "all", "escalate"]);

export const parseCliArgs = (args: ReadonlyArray<string>): ParsedCliArgs => {
	const positional: Array<string> = [];
	const flags = new Map<string, Array<string>>();
	const booleans = new Set<string>();
	for (let i = 0; i < args.length; i += 1) {
		const token = args[i]!;
		if (token.startsWith("--") && token.length > 2) {
			const eq = token.indexOf("=");
			if (eq !== -1) {
				const name = token.slice(2, eq);
				const val = token.slice(eq + 1);
				const list = flags.get(name) ?? [];
				list.push(val);
				flags.set(name, list);
				continue;
			}
			const name = token.slice(2);
			if (BOOLEAN_FLAGS.has(name)) {
				booleans.add(name);
				continue;
			}
			const next = args[i + 1];
			if (next !== undefined && !next.startsWith("--")) {
				const list = flags.get(name) ?? [];
				list.push(next);
				flags.set(name, list);
				i += 1;
			} else {
				booleans.add(name);
			}
		} else {
			positional.push(token);
		}
	}
	return { positional, flags, booleans };
};

export const parseReminderTime = (
	spec: string,
	now = Date.now(),
): number | null => {
	const trimmed = spec
		.trim()
		.replace(/^in\s+/i, "")
		.replace(/^\+/, "");
	if (trimmed === "") return null;
	// Compound or single relative durations: e.g. "30m", "2h", "1h30m", "2d", "1w"
	const relPattern = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/i;
	const relMatch = relPattern.exec(trimmed);
	if (
		relMatch &&
		(relMatch[1] || relMatch[2] || relMatch[3] || relMatch[4])
	) {
		const weeks = Number(relMatch[1] ?? 0);
		const days = Number(relMatch[2] ?? 0);
		const hours = Number(relMatch[3] ?? 0);
		const mins = Number(relMatch[4] ?? 0);
		const deltaMs =
			((weeks * 7 + days) * 24 * 60 + hours * 60 + mins) * 60_000;
		return deltaMs > 0 ? now + deltaMs : null;
	}
	const parsed = Date.parse(trimmed);
	if (!Number.isFinite(parsed) || parsed <= now) {
		return null;
	}
	return parsed;
};

export const callBridgeTool = (
	toolName: string,
	args: Record<string, unknown>,
	endpoint = getBridgeEndpoint(),
): Promise<unknown> =>
	new Promise((resolvePromise, rejectPromise) => {
		const socket = createConnection(endpoint);
		let buffer = "";
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			socket.destroy();
			rejectPromise(new Error("Little Later did not respond in time."));
		}, 15_000);

		const fail = (message: string) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			rejectPromise(new Error(message));
		};

		socket.on("connect", () => {
			socket.write(
				`${JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: { name: toolName, arguments: args },
				})}\n`,
			);
		});
		socket.on("data", (chunk: Buffer) => {
			buffer += chunk.toString("utf8");
			const newline = buffer.indexOf("\n");
			if (newline !== -1 && !settled) {
				settled = true;
				clearTimeout(timer);
				socket.end();
				try {
					const reply = JSON.parse(buffer.slice(0, newline)) as {
						result?: {
							content?: Array<{ type?: string; text?: string }>;
						};
						error?: { message?: string };
					};
					if (reply.error) {
						rejectPromise(
							new Error(
								reply.error.message ?? "MCP request failed.",
							),
						);
						return;
					}
					const text = reply.result?.content?.[0]?.text;
					if (typeof text === "string") {
						try {
							resolvePromise(JSON.parse(text));
						} catch {
							resolvePromise(text);
						}
					} else {
						resolvePromise(reply.result ?? null);
					}
				} catch {
					rejectPromise(
						new Error("Invalid JSON response from Little Later."),
					);
				}
			}
		});
		socket.on("error", () => {
			fail(
				"Cannot reach Little Later. Open Chrome, unlock your profile, and enable External agent MCP in Settings -> Data & Privacy.",
			);
		});
		socket.on("close", () => {
			fail("Connection to Little Later closed before a reply arrived.");
		});
	});

const formatSearchResult = (data: Record<string, unknown>): string => {
	const sections: Array<string> = [];
	const pushSection = (
		label: string,
		items: unknown,
		format: (item: Record<string, unknown>) => string,
	) => {
		if (!Array.isArray(items) || items.length === 0) return;
		sections.push(
			`${label} (${items.length}):\n${items
				.map((item) => `  - ${format(item as Record<string, unknown>)}`)
				.join("\n")}`,
		);
	};
	pushSection(
		"Saves",
		data.saves,
		(s) => `${String(s.customName || s.title || s.url)} — ${String(s.url)}`,
	);
	pushSection(
		"Tasks",
		data.tasks,
		(t) =>
			`[${t.done ? "x" : " "}] ${String(t.information ?? "")} (${String(t.id ?? "")})`,
	);
	pushSection(
		"Reminders",
		data.reminders,
		(r) =>
			`${String(r.message ?? "")} @ ${new Date(Number(r.target ?? 0)).toLocaleString()}`,
	);
	pushSection("Notes", data.notes, (n) => {
		const title = String(n.title || "").trim();
		const snippet = String(n.content || "")
			.replace(/\s+/g, " ")
			.slice(0, 80);
		return title ? `${title}: ${snippet}` : snippet;
	});
	pushSection(
		"Images",
		data.images,
		(img) => `${String(img.title ?? "Untitled")} (${String(img.id ?? "")})`,
	);
	return sections.length > 0 ? sections.join("\n\n") : "No matching records.";
};

export const parseAddTaskScheduleFlags = (
	flags: Map<string, Array<string>>,
	now = Date.now(),
): { dueAt?: number; recurrence?: Record<string, unknown> } => {
	const dueSpec = flags.get("due")?.[0];
	const repeatFreq = flags.get("repeat")?.[0]?.trim().toLowerCase();
	const intervalRaw = flags.get("interval")?.[0];
	const timeRaw = flags.get("time")?.[0];
	const daysRaw = flags.get("days")?.[0];
	const monthDayRaw = flags.get("month-day")?.[0];
	const monthRaw = flags.get("month")?.[0];

	if (repeatFreq !== undefined && dueSpec !== undefined) {
		throw new Error("Cannot combine --due with --repeat.");
	}
	if (
		repeatFreq === undefined &&
		(intervalRaw !== undefined ||
			timeRaw !== undefined ||
			daysRaw !== undefined ||
			monthDayRaw !== undefined ||
			monthRaw !== undefined)
	) {
		throw new Error(
			"Recurrence options (--interval, --time, --days, --month-day, --month) require --repeat.",
		);
	}

	if (repeatFreq !== undefined) {
		if (!["daily", "weekly", "monthly", "yearly"].includes(repeatFreq)) {
			throw new Error(
				"Invalid --repeat value. Use daily, weekly, monthly, or yearly.",
			);
		}
		let interval = 1;
		if (intervalRaw !== undefined) {
			if (!/^\d+$/.test(intervalRaw.trim())) {
				throw new Error(
					"Invalid --interval value. Use an integer >= 1.",
				);
			}
			interval = Number(intervalRaw.trim());
			if (!Number.isSafeInteger(interval) || interval < 1) {
				throw new Error(
					"Invalid --interval value. Use an integer >= 1.",
				);
			}
		}
		const time = timeRaw !== undefined ? timeRaw.trim() : "09:00";
		if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
			throw new Error('Invalid --time value. Use 24-hour "HH:MM".');
		}
		const dayMap: Record<string, number> = {
			mon: 1,
			monday: 1,
			tue: 2,
			tuesday: 2,
			wed: 3,
			wednesday: 3,
			thu: 4,
			thursday: 4,
			fri: 5,
			friday: 5,
			sat: 6,
			saturday: 6,
			sun: 7,
			sunday: 7,
		};
		let byWeekday: Array<number> | undefined;
		if (daysRaw !== undefined) {
			const tokens = daysRaw.split(",");
			byWeekday = [];
			for (const rawToken of tokens) {
				const token = rawToken.trim().toLowerCase();
				const mapped =
					token in dayMap
						? dayMap[token]
						: /^[1-7]$/.test(token)
							? Number(token)
							: NaN;
				if (!Number.isInteger(mapped) || mapped < 1 || mapped > 7) {
					throw new Error(
						`Invalid --days entry "${rawToken.trim()}". Use mon..sun or 1..7.`,
					);
				}
				if (!byWeekday.includes(mapped)) {
					byWeekday.push(mapped);
				}
			}
		}
		let byMonthDay: number | undefined;
		if (monthDayRaw !== undefined) {
			if (!/^-?\d+$/.test(monthDayRaw.trim())) {
				throw new Error(
					"Invalid --month-day value. Use 1..31 or -1 for the last day.",
				);
			}
			byMonthDay = Number(monthDayRaw.trim());
			if (
				!Number.isSafeInteger(byMonthDay) ||
				(byMonthDay !== -1 && (byMonthDay < 1 || byMonthDay > 31))
			) {
				throw new Error(
					"Invalid --month-day value. Use 1..31 or -1 for the last day.",
				);
			}
		}
		let byMonth: number | undefined;
		if (monthRaw !== undefined) {
			if (!/^\d+$/.test(monthRaw.trim())) {
				throw new Error("Invalid --month value. Use 1..12.");
			}
			byMonth = Number(monthRaw.trim());
			if (!Number.isSafeInteger(byMonth) || byMonth < 1 || byMonth > 12) {
				throw new Error("Invalid --month value. Use 1..12.");
			}
		}
		return {
			recurrence: {
				freq: repeatFreq,
				interval,
				time,
				...(byWeekday && byWeekday.length > 0 ? { byWeekday } : {}),
				...(byMonthDay !== undefined ? { byMonthDay } : {}),
				...(byMonth !== undefined ? { byMonth } : {}),
			},
		};
	}

	if (dueSpec !== undefined) {
		const parsedDue = parseReminderTime(dueSpec, now);
		if (parsedDue === null) {
			throw new Error(
				"Invalid --due value. Use a future time like 30m, 2h, 1d, or an ISO timestamp.",
			);
		}
		return { dueAt: parsedDue };
	}

	return {};
};

const runQuickCommand = async (
	command: string,
	rawArgs: Array<string>,
): Promise<void> => {
	const { positional, flags, booleans } = parseCliArgs(rawArgs);
	const asJson = booleans.has("json");
	const tags = flags.get("tag") ?? [];
	const limitRaw = flags.get("limit")?.[0];
	const limit = limitRaw ? Number(limitRaw) : undefined;

	if (command === "search") {
		const query = positional.join(" ").trim();
		if (!query) {
			console.error(
				"Usage: little-later-mcp search <query> [--tag <tag>] [--limit <n>] [--json]",
			);
			process.exit(1);
		}
		const result = await callBridgeTool("search_all", {
			query,
			...(tags[0] ? { tag: tags[0] } : {}),
			...(Number.isFinite(limit) ? { limit } : {}),
		});
		console.log(
			asJson
				? JSON.stringify(result, null, 2)
				: formatSearchResult(result as Record<string, unknown>),
		);
		return;
	}

	if (command === "list") {
		const kind = (positional[0] ?? "").toLowerCase();
		const toolMap: Record<string, string> = {
			saves: "list_saves",
			tasks: "list_tasks",
			reminders: "list_reminders",
			notes: "list_notes",
			images: "list_images",
		};
		const tool = toolMap[kind];
		if (!tool) {
			console.error(
				"Usage: little-later-mcp list <saves|tasks|reminders|notes|images> [--tag <tag>] [--limit <n>] [--all] [--json]",
			);
			process.exit(1);
		}
		const includeAll = booleans.has("all");
		const result = await callBridgeTool(tool, {
			...(kind === "saves" ? { includeArchived: includeAll } : {}),
			...(kind === "tasks" ? { includeFinished: includeAll } : {}),
			...(tags[0] ? { tag: tags[0] } : {}),
			...(Number.isFinite(limit) ? { limit } : {}),
		});
		if (asJson) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			console.log(formatSearchResult({ [kind]: result }));
		}
		return;
	}

	if (command === "add-note") {
		const content = positional.join(" ").trim();
		if (!content) {
			console.error(
				"Usage: little-later-mcp add-note <content> [--title <title>] [--tag <tag>...]",
			);
			process.exit(1);
		}
		const title = flags.get("title")?.[0];
		const result = await callBridgeTool("create_note", {
			content,
			...(title ? { title } : {}),
			...(tags.length > 0 ? { tags } : {}),
		});
		console.log(
			asJson
				? JSON.stringify(result, null, 2)
				: `Created note (${String((result as { id?: string })?.id ?? "ok")}).`,
		);
		return;
	}

	if (command === "add-task") {
		const information = positional.join(" ").trim();
		if (!information) {
			console.error(
				"Usage: little-later-mcp add-task <information> [--priority low|medium|high] [--due <30m|2h|1d|ISO-time>] [--repeat daily|weekly|monthly|yearly] [--interval <n>] [--time HH:MM] [--days mon,wed,fri] [--reminder normal|escalating] [--tag <tag>...]",
			);
			process.exit(1);
		}
		const label = flags.get("label")?.[0];
		const priority = flags.get("priority")?.[0]?.toLowerCase();
		const reminder = flags.get("reminder")?.[0]?.toLowerCase();
		let dueAt: number | undefined;
		let recurrence: Record<string, unknown> | undefined;
		try {
			({ dueAt, recurrence } = parseAddTaskScheduleFlags(flags));
		} catch (error) {
			console.error(
				error instanceof Error
					? error.message
					: "Invalid task schedule options.",
			);
			process.exit(1);
		}
		const result = await callBridgeTool("create_task", {
			information,
			...(label ? { label } : {}),
			...(priority ? { priority } : {}),
			...(dueAt !== undefined ? { dueAt } : {}),
			...(recurrence ? { recurrence } : {}),
			...(reminder ? { reminder } : {}),
			...(tags.length > 0 ? { tags } : {}),
		});
		console.log(
			asJson
				? JSON.stringify(result, null, 2)
				: `Created task (${String((result as { id?: string })?.id ?? "ok")}).`,
		);
		return;
	}

	if (command === "add-save") {
		const url = positional[0]?.trim();
		if (!url) {
			console.error(
				"Usage: little-later-mcp add-save <url> [--title <title>] [--tag <tag>...]",
			);
			process.exit(1);
		}
		const title = flags.get("title")?.[0];
		const result = await callBridgeTool("create_save", {
			url,
			...(title ? { title, customName: title } : {}),
			...(tags.length > 0 ? { tags } : {}),
		});
		console.log(
			asJson
				? JSON.stringify(result, null, 2)
				: `Saved page (${String((result as { id?: string })?.id ?? "ok")}).`,
		);
		return;
	}

	if (command === "add-reminder") {
		const message = positional.join(" ").trim();
		const atSpec = flags.get("at")?.[0] ?? "";
		const target = parseReminderTime(atSpec);
		if (!message || target === null) {
			console.error(
				"Usage: little-later-mcp add-reminder <message> --at <30m|2h|1d|ISO-time> [--escalate] [--tag <tag>...]",
			);
			process.exit(1);
		}
		const result = await callBridgeTool("create_reminder", {
			message,
			target,
			escalate: booleans.has("escalate"),
			...(tags.length > 0 ? { tags } : {}),
		});
		console.log(
			asJson
				? JSON.stringify(result, null, 2)
				: `Created reminder for ${new Date(target).toLocaleString()} (${String((result as { id?: string })?.id ?? "ok")}).`,
		);
		return;
	}

	if (command === "done") {
		const id = positional[0]?.trim();
		if (!id) {
			console.error("Usage: little-later-mcp done <task-id>");
			process.exit(1);
		}
		const result = await callBridgeTool("complete_task", { id });
		console.log(
			asJson ? JSON.stringify(result, null, 2) : `Completed task ${id}.`,
		);
		return;
	}

	if (command === "reopen") {
		const id = positional[0]?.trim();
		if (!id) {
			console.error("Usage: little-later-mcp reopen <task-id>");
			process.exit(1);
		}
		const result = await callBridgeTool("reopen_task", { id });
		console.log(
			asJson ? JSON.stringify(result, null, 2) : `Reopened task ${id}.`,
		);
		return;
	}

	if (command === "overview") {
		const result = await callBridgeTool("get_productivity_overview", {});
		console.log(JSON.stringify(result, null, 2));
	}
};

const USAGE = [
	"Usage:",
	"  little-later-mcp install [chrome-extension-id...]",
	"  little-later-mcp serve",
	"  little-later-mcp status",
	"  little-later-mcp uninstall",
	"  little-later-mcp search <query> [--tag <tag>] [--limit <n>] [--json]",
	"  little-later-mcp list <saves|tasks|reminders|notes|images> [--tag <tag>] [--all] [--json]",
	"  little-later-mcp overview [--json]",
	"  little-later-mcp add-save <url> [--title <title>] [--tag <tag>...]",
	"  little-later-mcp add-note <content> [--title <title>] [--tag <tag>...]",
	"  little-later-mcp add-task <information> [--priority low|medium|high] [--due <spec>] [--repeat daily|weekly|monthly|yearly] [--time HH:MM] [--days mon,wed,fri] [--reminder normal|escalating] [--tag <tag>...]",
	"  little-later-mcp add-reminder <message> --at <30m|2h|1d|ISO-time> [--escalate] [--tag <tag>...]",
	"  little-later-mcp done <task-id>",
	"  little-later-mcp reopen <task-id>",
	"  little-later-mcp --version",
].join("\n");

const QUICK_COMMANDS = new Set([
	"search",
	"list",
	"overview",
	"add-save",
	"add-note",
	"add-task",
	"add-reminder",
	"done",
	"reopen",
]);

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
	} else if (command && QUICK_COMMANDS.has(command)) {
		void runQuickCommand(command, rest).catch((error: unknown) => {
			console.error(
				error instanceof Error ? error.message : "Command failed.",
			);
			process.exit(1);
		});
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
