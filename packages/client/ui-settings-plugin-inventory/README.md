# @unieai/uad-client-ui-settings-plugin-inventory

English | [中文](README.zh.md)

The read-only **plugin directory** on the [Plugins page](../ui-plugins-page/README.md): every plugin the Cordis Loader reports for this build, grouped, searchable, and drawing no control it cannot honour. One localized `plugins.page.area` contribution with id `plugin-directory` at order 5 — between the account's Studio MCP servers and the cordis configuration registry. No Remote read happens during plugin activation; the page mounting the area is what calls `ctx.remote.pluginInventory.list()` through [`api-remotes`](../../api/remotes/README.md), once, lazily.

## Why the page and not the settings panel

This was the `all` tab inside `ui-settings-plugins`' Plugins settings section, and that section is now an area on the standalone Plugins page. Two things follow. There is no `plugins` settings section left, and [`ui-settings-general`](../ui-settings-general/README.md) hides its Plugins nav row exactly when none exists — so returning the directory to the panel would resurrect a second Plugins destination, which is what the page was created to end. And a directory is what that page *is*: behind a tab in a developer-facing configuration section it becomes a subsection of a subsection whose heading, tab strip and chrome all belong to another package. It therefore takes a page area of its own, the seat the page documents for exactly that.

## What it draws

A heading, an intro, a search field, and then groups: a group heading with its count, a hairline under both, and under that a reflowing grid of rows. A row is not a card — no border, no fill, no radius. It is the plugin's short name over its exact module specifier in the code face, ellipsised to one line, with the root Fiber's phase as a small dot where the trailing control would be on the reference page.

Search matches the module specifier and the Loader entry id, case-insensitively. A group whose rows are all filtered out disappears rather than leaving an empty heading and a rule.

## The grouping, and the ones not taken

**Enabled and Disabled, because `enabled` is the only partition the wire states.** `pluginInventory.list()` reports four fields per row — the Loader entry id, the module specifier, effective enablement (including disabled ancestor groups), and the root Fiber's phase. Effective enablement is a boolean every row has, it is the fact a profile author set deliberately, and in the shipped web profile it is a real split rather than a formality: `dsh-web-app` disables roughly two dozen `dsh-base` rows whose host-plane duties moved behind agent presets.

Three groupings were considered and rejected:

- **By bundle** — `@unieai/uad-base`, `@unieai/uad-web-app`, a bundle installed into the profile. This is the true equivalent of the reference directory's provenance filter and it is the one worth having, but it is not on the wire and cannot be derived from what is. `app-boot` resolves each `dsh.profile.bundles` entry to its `cordis.patch.yml` and applies the patch lists over an empty root **in memory**; the composed `EntryOptions` keeps no record of which layer inserted it, and the profile's own `cordis.yml` on disk is the empty root. See *Known Limitations* for what reporting it would take.
- **By plane** — host versus browser. Every browser row in the shipped profile happens to be named `@unieai/uad-client-*`, but `@unieai/uad-api-remotes` is a browser row too and `dsh-client-modules` is both. That is a naming convention with exceptions, not data, and segmentation dressed as taxonomy reads to a user as fact.
- **By Fiber phase** — five buckets, four of them normally empty, and every row already carries its phase as the dot.

There is deliberately no editorial grouping. The reference's `Featured` and `Coding` headings come from a curated catalogue with an editorial layer behind it; this deployment has neither, and inventing one would be writing a taxonomy into a snapshot that does not carry it.

## No install, no toggle, no remove

The reference directory's rows end in a `+` or a `✓`. None is drawn here, and none may be: `pluginInventory.list()` is the only plugin RPC this deployment has. Installing is `uad plugin --profile web add <spec>`, a CLI command that forwards to `pnpm` in the profile directory and then reconciles `dsh.profile.bundles`; enablement is a `disabled:` line in a patch layer. A button in the browser for either would fail on press, every time. What the area draws instead is the sentence naming where each action actually lives — the same move the Studio MCP area above it makes for the same reason.

The trailing column carries a status dot rather than a glyph precisely so that nothing on the row looks pressable. The shared `StateDot` atom is not used: it carries four semantics and the Loader reports six phases, so two would have to borrow a meaning they do not have.

## Copy

`title`, `search`, `enabledTag` and `disabledTag` are copied verbatim from the UnieAI Copilot web product's `messages/{en,zh-cn,zh-tw,ja}.json`, with the source namespace and key named beside each line in [`src/client/locales.ts`](src/client/locales.ts). All four shipped locales carry a complete dictionary. Three deviations are recorded in that file's header: the zh-CN enabled/disabled pair keeps this package's own words because the reference's zh-cn values are written in traditional characters; the six Cordis lifecycle labels have no reference equivalent and are this package's own in every locale; and `intro` and `note` are this package's own, `note` because naming the working command is the honest replacement for a control that cannot act.

## Styling

CSS Modules and semantic `--dsw-alias-*` tokens only — no literal colour, no fallback value, no brand hue — in the language [`AccountSection`](../ui-unieai-account/src/client/AccountSection.module.css) states: 14/22 body, 12/18 caption, `border-l2` hairlines, 8px control radius. No `bg-layer-*` fill anywhere: layers 1–3 resolve to the same white in the light palette, so a surface painted with one would exist in dark and vanish in light. The directory needs no fill at all — the only bordered element is the search field, and that is the shared `Input` atom rather than a field restated locally.

The row grid is `repeat(auto-fill, minmax(min(288px, 100%), 1fr))`, the same construction the Studio MCP tool grid above uses. The `min(…, 100%)` floor is load-bearing rather than decorative: the page runs the full frame width, and a bare `288px` floor overflows its container the moment the frame is narrower than one track, which would scroll the whole page sideways at 390px.

## Model Experience

None, as this package only visualizes a Host-owned deployment snapshot in the browser and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One snapshot per page open or retry.** The area does not subscribe to Loader changes and does not refetch after reconnect; leaving the Plugins page and returning obtains a new one. The Loader emits `loader/config-update` and `loader/entry-init`, and Cordis emits Fiber status changes, so a subscription has something to ride; what is missing is a `pluginInventory` stream, and adding one is a host change.
- **Provenance is unreportable from this side, and grouping by bundle needs a host change.** The layer identity exists at composition time — `loadProfile` in [`app-boot`](../../boot/app-boot/README.md) returns a `ProfileLayer` per bundle carrying its `packageName` and its parsed patch list — and is discarded before any Loader entry exists. Reporting it means either stamping each inserted row with its originating layer during composition, or handing `PluginInventoryGateway` the loaded profile so it can attribute each id to the last layer whose `insert` list named it. Both touch [`plugin-inventory`](../../host/plugin-inventory/README.md) and `app-boot`, and the second is only as good as the ids: a patch row without an authored `id` gets a generated one and is attributable only positionally.
- **Installing needs an RPC that does not exist.** `uad plugin` spawns `pnpm` in the profile directory as a synchronous child process and rewrites `package.json`. A browser control would need a new Host Remote — long-running, streaming its progress, and holding an authority to write the profile and execute a package manager that no current Remote holds. It is a trust-fence decision before it is a UI one.
- **Enable, disable and remove need a writable Loader path.** The Loader can toggle an entry live (`entry.update({disabled})`), so the runtime half exists; what does not is a Remote to reach it, a rule for where the change persists — a row disabled in the browser must survive a restart, which means writing the profile's `cordis.patch.yml`, not the composed tree — and an answer for rows the user cannot be allowed to disable, such as the transport carrying the request.
- **The Loader entry id is searchable but not drawn.** It stays on the row as `data-plugin-entry` and remains a search target. It is not displayed because for all but a handful of rows it repeats the title, and where it does not — a patch insert without an authored id — it is a generated hex string that names nothing. A reader editing `cordis.patch.yml` needs it; that reader has the file open.
- **No filter row.** The reference's pills filter by provenance, which this deployment does not have (above). A pill row over the one axis that is left would restate the group headings directly beneath it, and a single-value filter is a control with nothing to do.
- **No hero banner.** The reference's is a carousel of promoted plugins from a curated catalogue. There is nothing here to promote, and filling the space with an arbitrary row would be an editorial claim this package cannot support.
