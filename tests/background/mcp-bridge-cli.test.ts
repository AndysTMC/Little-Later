import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { existsSync, rmSync, symlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
	isJsonRpcNotification,
	startStdioServer,
} from "../../packages/mcp-bridge/src/cli";
import { getBridgeEndpoint } from "../../packages/mcp-bridge/src/nativeHost";

describe("MCP bridge stdio CLI", () => {
	const cleanups: Array<() => void> = [];

	afterEach(() => {
		while (cleanups.length > 0) {
			cleanups.pop()?.();
		}
	});

	it("resolves the same bridge socket path regardless of XDG_RUNTIME_DIR", () => {
		const prev = process.env.XDG_RUNTIME_DIR;
		try {
			process.env.XDG_RUNTIME_DIR = "/run/user/1000";
			const withXdg = getBridgeEndpoint();
			delete process.env.XDG_RUNTIME_DIR;
			const withoutXdg = getBridgeEndpoint();
			expect(withXdg).toBe(withoutXdg);
		} finally {
			if (prev === undefined) {
				delete process.env.XDG_RUNTIME_DIR;
			} else {
				process.env.XDG_RUNTIME_DIR = prev;
			}
		}
	});

	it("identifies JSON-RPC notifications (no id) vs requests", () => {
		expect(
			isJsonRpcNotification(
				JSON.stringify({
					jsonrpc: "2.0",
					method: "notifications/initialized",
				}),
			),
		).toBe(true);
		expect(
			isJsonRpcNotification(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
				}),
			),
		).toBe(false);
		expect(
			isJsonRpcNotification(
				JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/list",
				}),
			),
		).toBe(false);
	});

	it("forwards requests and suppresses replies for notifications", async () => {
		const endpoint = join(tmpdir(), `ll-mcp-test-${randomUUID()}.sock`);
		const server = createServer((socket) => {
			let buf = "";
			socket.on("data", (chunk) => {
				buf += chunk.toString("utf8");
				const nl = buf.indexOf("\n");
				if (nl !== -1) {
					const req = JSON.parse(buf.slice(0, nl)) as {
						id: number;
						method: string;
					};
					socket.write(
						`${JSON.stringify({
							jsonrpc: "2.0",
							id: req.id,
							result: { echoed: req.method },
						})}\n`,
					);
				}
			});
		});

		await new Promise<void>((resolve) => server.listen(endpoint, resolve));
		cleanups.push(() => {
			server.close();
			rmSync(endpoint, { force: true });
		});

		const input = new PassThrough();
		const output = new PassThrough();
		const replies: Array<Record<string, unknown>> = [];
		let outBuf = "";
		output.on("data", (chunk: Buffer) => {
			outBuf += chunk.toString("utf8");
			const lines = outBuf.split("\n");
			outBuf = lines.pop() ?? "";
			for (const line of lines) {
				if (line.trim()) {
					replies.push(JSON.parse(line) as Record<string, unknown>);
				}
			}
		});

		startStdioServer(endpoint, input, output);

		input.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })}\n`,
		);
		input.write(
			`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
		);
		input.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`,
		);

		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(replies).toHaveLength(2);
		expect(replies.map((r) => r.id).sort()).toEqual([1, 2]);
	});

	it("returns a JSON-RPC error instead of hanging if the host closes mid-request", async () => {
		const endpoint = join(tmpdir(), `ll-mcp-close-${randomUUID()}.sock`);
		const server = createServer((socket) => {
			socket.on("data", () => {
				socket.destroy();
			});
		});

		await new Promise<void>((resolveListen) =>
			server.listen(endpoint, resolveListen),
		);
		cleanups.push(() => {
			server.close();
			rmSync(endpoint, { force: true });
		});

		const input = new PassThrough();
		const output = new PassThrough();
		const replies: Array<{ id?: number; error?: { code?: number } }> = [];
		let outBuf = "";
		output.on("data", (chunk: Buffer) => {
			outBuf += chunk.toString("utf8");
			const lines = outBuf.split("\n");
			outBuf = lines.pop() ?? "";
			for (const line of lines) {
				if (line.trim()) {
					replies.push(
						JSON.parse(line) as {
							id?: number;
							error?: { code?: number };
						},
					);
				}
			}
		});

		startStdioServer(endpoint, input, output);
		input.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 9, method: "ping" })}\n`,
		);

		await new Promise((r) => setTimeout(r, 150));

		expect(replies).toHaveLength(1);
		expect(replies[0]?.id).toBe(9);
		expect(replies[0]?.error?.code).toBe(-32001);
	});

	it("executes CLI when invoked through a symlink (as npx does)", () => {
		const builtCli = resolve("packages/mcp-bridge/dist/cli.mjs");
		if (!existsSync(builtCli)) return;
		const linkPath = join(tmpdir(), `ll-mcp-bin-${randomUUID()}`);
		symlinkSync(builtCli, linkPath);
		cleanups.push(() => rmSync(linkPath, { force: true }));

		let stderr = "";
		try {
			execFileSync(process.execPath, [linkPath], {
				encoding: "utf8",
				env: { PATH: process.env.PATH ?? "" },
			});
		} catch (error) {
			stderr = (error as { stderr?: string }).stderr?.toString() ?? "";
		}
		expect(stderr).toContain("Usage:");
	});
});
