# Little Later Local MCP Bridge (`little-later-mcp`)

Connect local MCP clients (Codex, Claude Desktop, Cursor, VS Code, or CLI agents) to an unlocked Little Later vault over Chrome Native Messaging.

## Security model

- **Disabled by default**: enable in Little Later **Settings -> Data & Privacy -> External agent MCP** (`Read-only` or `Read & write`).
- **Unlocked only**: requests fail immediately while your Little Later profile is locked.
- **No secret leakage**: vault keys, passwords, AI API keys, and **Locked Notes** are never exposed or writable over MCP.
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

## Available MCP tools & resources

### Read tools (`Read-only` and `Read & write`)

- `list_saves`, `list_history`, `list_tasks`, `list_reminders`, `list_notes`, `get_note`, `list_images`, `list_links`, `list_tags`, `search_all`, `get_productivity_overview`

### Write tools (`Read & write` only)

- **Saves**: `create_save`, `update_save` (rename, archive/unarchive, retag, snapshot), `delete_save`
- **Tasks**: `create_task`, `update_task` (full anytime / due / recurring schedules with `daily`/`weekly`/`monthly`/`yearly`, `interval`, `time`, `byWeekday`, `byMonthDay`, `byMonth`, attached `normal`/`escalating` reminder, priority, tags, and `saveIds`), `complete_task`, `reopen_task`, `delete_task`
- **Reminders**: `create_reminder`, `update_reminder`, `delete_reminder` (accepts epoch ms or ISO-8601 timestamps)
- **Notes (unlocked only)**: `create_note`, `update_note`, `delete_note`
- **Images**: `update_image`, `delete_image`
- **Links**: `link_records`, `unlink_records`

### Resources

- `littlelater://saves`, `littlelater://history`, `littlelater://tasks`, `littlelater://reminders`, `littlelater://notes`, `littlelater://images`, `littlelater://links`, `littlelater://tags`

## Desktop CLI quick-capture & search

Once the native host is installed and Little Later is unlocked, you can query or capture directly from your terminal, Raycast, Alfred, Rofi, or shell scripts (write commands require **Read & write** mode):

```sh
npx -y little-later-mcp search "design docs" --tag work
npx -y little-later-mcp list tasks
npx -y little-later-mcp overview
npx -y little-later-mcp add-save "https://example.com/spec" --title "Spec" --tag docs
npx -y little-later-mcp add-note "Draft outline for Q4" --title "Q4" --tag work
npx -y little-later-mcp add-task "Review PR #82" --priority high --due 2h --reminder normal --tag dev
npx -y little-later-mcp add-task "Weekly review" --repeat weekly --days mon,fri --time 09:30 --reminder escalating
npx -y little-later-mcp add-reminder "Standup" --at 30m
npx -y little-later-mcp done <task-id>
npx -y little-later-mcp reopen <task-id>
```

Pass `--json` to `search`, `list`, `overview`, or any `add-*` command for machine-readable output.

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
