# Little Later Local MCP Bridge

Connect local MCP clients (such as desktop coding assistants or CLI agents) to an unlocked Little Later vault over Chrome Native Messaging.

## Security model

- **Disabled by default**: enable in Little Later **Settings -> Security -> External agent MCP** (`Read-only` or `Read & write`).
- **Unlocked only**: requests fail immediately while your Little Later profile is locked.
- **No secret leakage**: vault keys, passwords, AI API keys, and **Locked Notes** are never exposed over MCP.
- **Local only**: communicates exclusively via Chrome Native Messaging and a user-private local IPC socket (`0600`).

## Setup

1. Find your Little Later extension ID in `chrome://extensions`.
2. Register the Chrome Native Messaging host manifest:

    ```sh
    bun packages/mcp-bridge/src/cli.ts install <your-extension-id>
    ```

3. In Little Later, open **Settings -> Security**, set **External agent MCP** to **Read-only** or **Read & write**, and grant the optional `nativeMessaging` permission.
4. Add the MCP server to your local agent configuration:

    ```json
    {
    	"mcpServers": {
    		"little-later": {
    			"command": "bun",
    			"args": ["packages/mcp-bridge/src/cli.ts", "serve"]
    		}
    	}
    }
    ```
