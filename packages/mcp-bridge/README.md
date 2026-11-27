# Little Later Local MCP Bridge (`little-later-mcp`)

Connect local MCP clients (Codex, Claude Desktop, Cursor, VS Code, or CLI agents) to an unlocked Little Later vault over Chrome Native Messaging.

## Security model

- **Disabled by default**: enable in Little Later **Settings -> Data & Privacy -> External agent MCP** (`Read-only` or `Read & write`).
- **Unlocked only**: requests fail immediately while your Little Later profile is locked.
- **No secret leakage**: vault keys, passwords, AI API keys, and **Locked Notes** are never exposed over MCP.
- **Local only**: communicates exclusively via Chrome Native Messaging and a user-private local IPC socket (`0600`).

## Setup (`npx` — Node.js 18+ required)

Requires **Node.js 18 or newer** (no repository clone or standalone release binary required).

1. In Little Later, open **Settings -> Data & Privacy**, set **External agent MCP** to **Read-only** or **Read & write**, and grant the optional `nativeMessaging` permission.
2. Run the one-time Native Messaging host installer using the extension ID shown in **Settings -> Data & Privacy** (or `chrome://extensions`):

    ```sh
    npx -y little-later-mcp install <extension-id>
    ```

    Passing `<extension-id>` ensures Chrome registers the exact installed extension (whether installed from a signed `.crx`, Chrome Web Store, or unpacked build). The installer copies the self-contained host script to your user app-data directory and registers it with Chrome (and other detected Chromium browsers) using the absolute `node` path, so Chrome never depends on shell `PATH` or `npx` cache.

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

## Desktop CLI quick-capture & search

Once the native host is installed and Little Later is unlocked, you can query or capture directly from your terminal, Raycast, Alfred, Rofi, or shell scripts (write commands require **Read & write** mode):

```sh
npx -y little-later-mcp search "design docs" --tag work
npx -y little-later-mcp list tasks
npx -y little-later-mcp add-note "Draft outline for Q4" --title "Q4" --tag work
npx -y little-later-mcp add-task "Review PR #72" --priority high --tag dev
npx -y little-later-mcp add-reminder "Standup" --at 30m
npx -y little-later-mcp done <task-id>
```

Pass `--json` to `search`, `list`, or any `add-*` command for machine-readable output.

## Uninstall

```sh
npx -y little-later-mcp uninstall
```
