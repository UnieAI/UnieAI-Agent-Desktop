# @deepseek-ai/dsh-client-ui-brand-unieai

English | [中文](README.zh.md)

This package fills `sidebar.brand.mark`, `sidebar.brand.name`, and `conversation.hero.brand.mark` with the UnieAI mark and name. It registers unconditionally: unlike the upstream official-brand package, which self-disables outside an `official` build profile, a UnieAI composition drops that package's roster row rather than competing with it for the same cells.

The three occupants install as one declaration-aware registration set through nested `slots.inject()` calls. The package therefore works whether its row activates before or after the sidebar and conversation declarers, withdraws all occupants when either declaration collapses, and leaves no partial brand mix during HMR. It retains no runtime state. The node half is an empty Loader seat, and the browser title remains a build-environment concern outside this package.

The mark is drawn with `currentColor` against the `ui-theme` brand ramp, so it follows the theme without this package declaring a light/dark branch. The name is set in the product typeface: UnieAI ships no wordmark artwork.

## Model Experience

None, as the package contributes browser presentation only; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The package supplies one occupant set** — alternative presentation belongs in another Cordis package occupying the same slots.
- **The browser title is independent** — `DSH_CLIENT_TITLE` selects title text at build time rather than through a UI slot.
- **The mark is inlined, not an asset** — the path data lives in the component, so replacing the artwork is a source change rather than a file swap.
