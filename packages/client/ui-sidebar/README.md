# @unieai/uad-client-ui-sidebar

English | [中文](README.zh.md)

Sidebar shell plugin: the brand row, New chat action, the nav-row seat under it, the layout-owned collapse control, the scroll-aware region seat, and the identity row that closes the column. [ui-workspace](../ui-workspace/README.md) owns the Workspace and Session browser rendered into `sidebar.workspaces`; this package neither derives its rows nor owns its view preferences. Collapse into the layout-owned 56px rail remains presentation-local. Contract: the [slot system standard](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md).

The expanded brand row renders `sidebar.brand.mark` and `sidebar.brand.name` as independent single slots, while the collapsed rail renders the same mark slot. The expanded mark sits in a 28px hairline identity plate and is requested at 16px; the rail asks for 24px. The name is set at 13/600 beside it, so the header row is one 28px control in a 12/4 pad. Without occupants, the shell uses the fish mark and a `UnieAI Agent` label carrying the build's 7-character `DSH_CLIENT_COMMIT_HASH` badge. A deployment package can replace either value without replacing the New chat control or rail geometry; declaration-aware `slots.inject()` lets such a package activate before or after the sidebar.

Three nav rows open the column, in the reference's own order: **New chat**, **Search**, and — through `sidebar.nav.action` — **Plugins**. Search is the one that belongs to somebody else: the field, its debounce and its results are [ui-workspace](../ui-workspace/README.md)'s, so the shell asks rather than reaches. Pressing the row raises the `searchRequest` nonce on the region's owner share (and expands the column first when collapsed); the region decides what opening means. A nonce and not a flag, because two presses are two requests and a boolean would swallow the second.

New chat starts the runtime's page-local frontend Session Intent. The runtime targets the explicit Workspace used by a scoped action, otherwise the current Session's Workspace, otherwise the most recently active Workspace; when none exists it clears into the blank New Session page. Workspace-specific controls and the shared picker belong to ui-workspace.

The column's rows share one box: 8px of inline padding, then the reference column's own row — `7px 10px` of padding around 13/19.5 copy at `--dsw-radius-control`, so a row measures 248x33.5 inside the 264px column — with secondary ink that reaches primary on hover over a 150ms colour transition. The row itself keeps the inherited weight; the label alone carries the 500. New chat, the `sidebar.nav.action` rows under it, and the workspace browser's rows all use it, so the column reads as a single list rather than as stacked components.

`SidebarRootComponentProps` composes the layout owner share, the global `useSessions` and `useWorkspaces` hooks, the declared brand, `sidebar.nav.action`, `sidebar.workspaces`, `sidebar.settings`, and `sidebar.account` child slots, and injected `startSession` plus sidebar-toggle callbacks. There is no plugin store.

During a live collapse, the shell holds the expanded content at its current width while it fades out for 150ms. The upper controls—the shell toggle and New chat, the nav rows, plus add and search rendered through `sidebar.workspaces`—then share one 150ms fade and 49px leftward translation into the 56px rail, ending with the layout's 300ms column slide; every 36px control box follows the same path to the rail's 10px left inset. The bottom-pinned identity row shares the fade timing but has no horizontal translation. A page that starts collapsed renders the rail statically, and reduced-motion mode disables both transitions.

Scrollbars in the column are a pointer affordance: the shell rebinds ui-theme's [scrollbar indirection](../ui-theme/README.md) to `transparent` whenever the pointer is outside it, and keeps the thumb drawn for 2s after the pointer leaves, so a list nobody is pointing at carries no bar. The reservation that keeps rows from moving belongs to the scrolling region ([ui-workspace](../ui-workspace/README.md)), so revealing a thumb never reflows.

`sidebar.nav.action` is the ordered list of nav rows under New chat, the way the reference column opens. Occupants receive only the column state (`wide`) and draw the shell's own row box, which New chat above them draws; ui-settings-general registers the Plugins row into it. The seat stacks them full width expanded and centres each 36px control on the rail.

The foot is two seats in one band: the `sidebar.footer.action` list, and under it ONE identity row shared by `sidebar.account` and `sidebar.settings`. That row is a single 248x40 box at `--dsw-radius-control` — `6px 8px` of padding, 10px gaps — matching the row the UnieAI web product closes its own sidebar with; because two packages fill it, the seat owns the box and each occupant brings only its content and its own interactive chrome: ui-unieai-account the 28px identity mark and the 13/500 name that takes the slack, ui-settings-general the 15px settings glyph pinned at the right end. The band carries an 8px vertical inset, a top hairline at `--dsw-alias-border-l2`, and a 2px side inset that cancels the row's `-2px` horizontal bleed, so its box sits on the same left and right edges as New chat and the session rows. Footer actions stack as full-width rows above it. The rail drops the hairline and the side inset, turns the identity row on its side (mark above glyph, 4px apart), and centres each 36px control.

The `/client` exports are the plugin body (`apply`/`inject`) plus the contract types only; SidebarRoot, the row components, and the tree derivation remain package-internal behind the slot registration.

## Model Experience

None, as the sidebar renders the browser session list; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Session state-dot rendering is owned by [ui-workspace](../ui-workspace/README.md)** — no done/error notification sources are available.
- **Workspace browser behavior is composition-owned** — grouping, ordering, search, and row state belong to [ui-workspace](../ui-workspace/README.md), not this shell.
- **"New task completed" unread marking is local viewing state** — completion-time > last-seen never reaches the host.
- **The identity plate's radius is a literal 6px** — the reference column sets its header chrome one step below the row radius, and `--dsw-*` declares no token at that step. Reported to the theme owner rather than added here.
- **The 56px rail is this app's own** — the reference column has no rail state, so its geometry (36px circles, 12px rhythm) is not copied from anywhere and stays as it was.
