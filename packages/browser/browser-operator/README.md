# @unieai/uad-browser-operator

English | [中文](README.zh.md)

The browser a **person** drives. `OperatorBrowserService` registers as `ctx.operatorBrowsers`, launches a real Chrome, attaches to its page over the DevTools Protocol, and streams the page's repaints as cordis events. Like the [operator terminal](../../terminal/terminal-operator/README.md), it is scoped to a workspace rather than to a chat, and the model cannot see or touch anything here.

## Why not an iframe

The panel could in principle embed a page directly and skip this package entirely. It cannot in practice: every site worth reaching this way — a dashboard, a console, an admin page the reader is already signed in to — sets `X-Frame-Options` or a `frame-ancestors` CSP precisely to stop a document from embedding it, and a browser enforces that before any code of ours runs. What Chrome refuses to frame it will happily *screencast*, so the picture comes back as JPEG frames over CDP and the gestures go the other way.

That inversion also decides the geometry. The Host is told the panel's own pixel size and the picture is painted 1:1, so a click at `(x, y)` on screen is a click at `(x, y)` in the page. A scaled picture would need every gesture rescaled with it, and would be wrong for the one frame between a resize and the repaint that answers it.

## Why its own Chrome, not the one already running

`open` launches a fresh Chrome with `--remote-debugging-port=0` and a throwaway `--user-data-dir` under the system temp directory. Attaching to a browser the reader is already using was the other option and is worse in every direction: `Page.bringToFront` and `Page.navigate` would move their windows and their tabs around underneath them, a screencast would broadcast whatever else they had open, and closing the panel would have to decide which of their tabs it was allowed to end. A separate profile also means the operator browser starts signed out — which is honest about what it is, rather than quietly inheriting a logged-in session nobody chose to lend it.

Chrome is found from `RABI_CHROME` first, then the platform's well-known install paths, then the Playwright browser cache (newest first). Nothing is downloaded: a package that fetches a browser during a call is a package that fails on a metered connection halfway through opening a tab.

## Contract

- Browsers are **workspace-scoped**, and `open` bounds live browsers per workspace (`maxBrowsersPerWorkspace`). A closed browser frees its slot.
- **`http` and `https` only.** `file:` would turn the address bar into a reader for the host filesystem, and the schemes a browser treats specially reach the browser itself rather than a page. A refusal is `BLOCKED_URL`.
- Repaints are published as `operator-browser/frame` and the **last one is retained**, so a reopened panel or a reconnected browser paints what the page already looks like instead of an empty rectangle. Exactly one frame per browser is kept, replaced rather than accumulated — a screencast is not a scrollback.
- Sizes are **clamped, not refused**, for the operator terminal's reason: a panel that is hidden, mid-mount, or mid-drag measures zero or a fraction, and refusing would turn an ordinary render into a failed gesture.
- `Page.bringToFront` is sent **before** `Page.startScreencast`. Headless Chrome has no window manager, and without it the screencast answers `Not attached to an active page` — the page is real, but nothing has told Chrome it is the visible one.
- `close` kills the process, closes the CDP socket, and removes the profile directory. Removal retries: Chrome's helper processes are still writing when the parent exits, and a first `rm` loses that race with `ENOTEMPTY`.
- Teardown is registered through `ctx.effect`, so unloading the plugin ends every browser it started. A leaked Chrome is not a leaked file handle — it is a visible process holding a profile nothing can reach.

## Model Experience

None, as the package registers no tool and contributes nothing to any prompt; the browser opened here is invisible to the model, which reaches the web only through `tool-web` over `ctx.web`.

#### KV Cache effect

None; this package assembles and sends nothing.

## Known Limitations and Deferred Work

- **The browser reaches whatever the Host's machine reaches**, including `localhost` and anything on its network. That is what makes the panel useful and it is why `browser.*` is loopback-pinned; `enabled: false` removes the surface for a deployment that does not want it. It is not a sandbox.
- No history. There is no back or forward, because the service exposes neither — a control that cannot act is worse than an absent one. Navigation is by address bar and by clicking links.
- No downloads, no file chooser, no printing, no devtools. A file the page hands to Chrome lands in a throwaway profile directory nothing else can read.
- Frames are JPEG, so a page of small text is softer than the same page in a real window. `frameQuality` trades that against how fast the stream keeps up.
- Chrome runs headless, and a small number of sites behave differently there. Nothing detects or works around that.
- One browser is one page. Tabs a site opens with `target=_blank` attach nowhere and are not shown.
- Chrome is found, never downloaded. A machine with none gets `NO_CHROME` and a message naming `RABI_CHROME`.
