# Agent Note: A slot in the sidebar session row's menu, and why it is root scope

Status: implemented

English | [中文](2026-08-23-sidebar-session-row-menu-slot.zh.md)

## Problem

Session-log export sat in the conversation header (`conversation.session.header.utilities`), which put a per-session utility in the one place where it could only ever act on the session already open. The natural home is the sidebar session row's overflow menu, beside Rename / Fork / Archive — but that menu was hardcoded in `ui-workspace`'s `Rows.tsx`, with no extension point at all, so any package wanting a row there would have to be imported by the browsing region.

The menu is also the wrong lifetime for the export's result dialog. A menu row unmounts the moment the menu closes, and `/export` runs from the composer with no menu involved at all, so the dialog cannot live where the gesture starts.

## Decision

**One `list` hole, declared by the WorkspaceBrowser entry: `sidebar.workspaces.session.menu.action`.** It sits beside the entry's existing `sidebar.workspaces.directoryFlow` child, so it exists exactly while the browsing region is mounted. Rename, Fork, and Archive stay hardcoded: each drives browser-owned dialog state or region state that no occupant could supply, and moving them into the hole would export three private callbacks as a public contract for no consumer.

**The owner share carries the session; the framework must not.** `SessionRowMenuActionOwnerProps` is `{ sessionId, closeMenu }`. The hole is `root` scope precisely because a `session`-scope hole would hand every occupant the framework's `sessionId` — the *current selection*. Every row except the selected one would then act on the wrong session, silently: the export would download the open session's log from a menu opened on a different row. Root scope removes that prop from the kit entirely, so the row's identity can only come from the owner, and `SessionNodeItem` dispatches one occurrence of the hole per row with that row's `node.id`. `closeMenu` is in the share because the menu's own `onSelect` dispatch never sees an occupant's click.

**`Menu` gained `extra` and exported `MenuItemButton`.** A slot occupant renders a React node, while `Menu` dispatches `MenuItem` descriptors by id — the two cannot meet through `items`. `extra` is a `ReactNode` area rendered after `items` inside the scrolling viewport and outside `onSelect`; `MenuItemButton` is the row `Menu` draws for its own entries, exported so an occupant matches the rows above it instead of restating the 36px cell metrics and `--dsw-alias-*` tokens in its own package.

**The export dialog moved to `shell.overlay`.** `session-log-export` now makes two browser registrations: the menu row into the new hole, and `SessionLogDownloadOverlay` into the frame-wide overlay, where it renders one `Modal` per session with an open download entry. That seat outlives both entry paths, which the previous header seat did not: `/export` executed with no conversation open had no dialog at all.

## Consequences

The conversation header no longer carries an export control; the `conversation.session.header.utilities` list is left to ui-conversation's own details toggle. `session-log-export` swapped its `ui-conversation` dependency for `ui-layout` and `ui-workspace` (type-only imports for the two SlotMap merges), and `HeaderAction.tsx` with its stylesheet is gone. The dialog now reports downloads started anywhere in the app, including from a session that is not open.

An occupant of the new hole is remounted with every menu open and unmounted with every close, and the JSDoc says so: state that must survive the gesture belongs on `shell.overlay`. The hole is also dispatched once per visible row rather than once per menu, so an occupant's component renders for every listed session even while no menu is open — cheap for a button, and the reason an occupant must not do work in its body.

`Menu`'s own rows now render through `MenuItemButton`, so the submenu and selection markup has one definition. `MenuItemButtonProps` spells its optional members as `| undefined` because the client tsconfig runs `exactOptionalPropertyTypes`.

## Testing

`ui-workspace` covers the hole at both levels: `rows.client.spec.tsx` asserts the occupant renders as the fourth `menuitem` and receives the row's session while a different session is current, and that an unoccupied hole leaves the three built-in rows; `workspace-browser.client.spec.tsx` asserts the browser dispatches `sidebar.workspaces.session.menu.action` with the row session, not `state.current`. `ui-primitives` covers `extra` rows rendering after `items` without reaching `onSelect`. `session-log-export` covers the row action closing the menu before requesting its own session's download, the apply registering into the two new slots and none in the header seat, and the overlay reporting a download for a session no surface is showing.

## Alternatives considered

- **Declare the hole in `ui-sidebar`.** The `…` menu is not the sidebar shell's: the shell owns column geometry and hands the whole browsing region to `sidebar.workspaces`. A hole must be declared by the entry that renders it, and that entry is ui-workspace's WorkspaceBrowser.
- **`session` scope for the hole.** Reads well and is actively wrong: the session kit binds the current selection, so a row that is not the open one would export the wrong log with no visible error. Root scope makes the mistake unrepresentable.
- **Move Rename / Fork / Archive into the hole too.** They would need the browser's rename-dialog state, its fork callback, and its archive echo handling in the owner share — a public contract with one occupant, which the package rules reject as an abstraction without a second consumer.
- **Keep the dialog in the menu row's own subtree.** The menu unmounts it on close, so the user would see nothing after clicking, and `/export` would lose its only feedback surface.
- **Keep the dialog registered in the conversation header.** It reports downloads for the open session only, which is exactly the coupling this change removes.
- **Have the occupant render a bare `<button>` of its own.** It would have to restate the menu cell's metrics and color tokens, leaving two definitions of one row that drift apart.
