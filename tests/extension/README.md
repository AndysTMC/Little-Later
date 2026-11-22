# Extension end-to-end tests

These tests load the built extension (`dist/`) into Playwright's Chromium
and drive it as a user would. They cover what the other suites cannot: the
real service worker, `chrome.runtime` messaging, `chrome.storage.session`,
OPFS staging, alarms, context menus and notifications.

## Running

- `bun run test:ext` builds `dist/` and runs every `*.ext.ts` file.
- `bunx playwright test -c playwright.extension.config.ts -g "<name>"` runs
  one test against the existing `dist/`. Rebuild after changing `src/`.
- `HEADED=1` shows the browser.
- A failure leaves a trace in `test-results/`; open it with
  `bunx playwright show-trace <trace.zip>`.

## Writing a test

Import `test` and `expect` from `./fixtures`, never from
`@playwright/test`. Each test gets a fresh browser profile.

| Fixture or helper        | Use                                                             |
| ------------------------ | --------------------------------------------------------------- |
| `openPopup(route)`       | Opens `index.html#<route>` in a tab; returns the page           |
| `openPanel()`            | Opens `sidepanel.html` (LittleAI) in a tab; returns the page    |
| `serviceWorker`          | The worker at the start of the test; `evaluate` runs code in it |
| `stopServiceWorker()`    | Stops the worker as Chrome's idle timer would                   |
| `currentServiceWorker()` | The live worker, started if needed; use after a stop            |
| `extensionId`            | For building `chrome-extension://` URLs                         |
| `context`                | The browser context: open web pages, read service workers       |
| `createProfile(...)`     | Creates and unlocks a profile through the form; lands on Home   |
| `sendCommand(page, ...)` | Sends a worker command from an extension page                   |

## Rules that keep these tests honest

- Drive the popup through its controls (roles and labels). Use
  `sendCommand` or `serviceWorker.evaluate` to arrange state or to check
  it, not in place of the user action a test is about.
- Assert what the user would see, and check the stored state when the
  screen cannot show it (an alarm, the session, a database row).
- Never sleep for a fixed time to wait for the app. Use `expect(...)`
  with a locator, or `expect.poll`.
- Web pages come from a local server started in the test, never the
  internet.
- After `stopServiceWorker()`, the old `serviceWorker` object is dead.
  Take a new one with `currentServiceWorker()`.

## What the browser cannot do here

- The toolbar popup itself cannot be opened by a test; the same page in a
  tab stands in for it. Behaviour that depends on the popup window closing
  is out of reach.
- Native notifications and the right-click menu are drawn by the operating
  system. Check them through `chrome.notifications.getAll()` and by
  dispatching the click in the worker.
- `chrome.idle` state cannot be forced from a page; lock through the
  session instead, or call the listener's effect directly.
