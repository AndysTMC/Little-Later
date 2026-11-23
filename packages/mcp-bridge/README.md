# Little Later Local MCP Bridge (`little-later-mcp`)

Connect local MCP clients (Codex, Claude Desktop, Cursor, VS Code, or CLI agents) to an unlocked Little Later vault over Chrome Native Messaging.

## Security model

- **Disabled by default**: enable in Little Later **Settings -> Data & Privacy -> External agent MCP** (`Read-only` or `Read & write`).
- **Unlocked only**: requests fail immediately while your Little Later profile is locked.
- **No secret leakage**: vault keys, passwords, AI API keys, and **Locked Notes** are never exposed over MCP.
- **Local only**: communicates exclusively via Chrome Native Messaging and a user-private local IPC socket (`0600`).

## Setup (recommended: `npx` — no repo clone required)

1. In Little Later, open **Settings -> Data & Privacy**, set **External agent MCP** to **Read-only** or **Read & write**, and grant the optional `nativeMessaging` permission.
2. Run the one-time Native Messaging host installer (defaults to the official Little Later release ID; pass a custom ID only for unpacked dev builds):

    ```sh
    npx -y little-later-mcp install
    ```

    This copies the self-contained host script to your user app-data directory and registers it with Chrome (and other detected Chromium browsers) using the absolute `node` path, so Chrome never depends on shell `PATH` or `npx` cache.

3. Verify the connection:

    ```sh
    npx -y little-later-mcp status
    ```

4. Add the MCP server to your local agent configuration:

    ```json
    {
    	"mcpServers": {
    		"little-later": {
    			"command": "npx",
    			"args": ["-y", "little-later-mcp", "serve"]
    		}
    	}
    }
    ```

## Standalone binary (no Node.js required)

Each GitHub Release also attaches standalone `little-later-mcp` binaries for Linux, macOS, and Windows:

```sh
./little-later-mcp install <your-extension-id>
./little-later-mcp status
```

Then configure your MCP client with `"command": "/path/to/little-later-mcp"` and `"args": ["serve"]`.

## Uninstall

```sh
npx -y little-later-mcp uninstall
```
