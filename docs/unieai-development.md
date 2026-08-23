# Developing UnieAI Agent

English | [中文](unieai-development.zh.md)

UnieAI Agent is the desktop personal edition of the UnieAI Copilot web product, built on this fork of DeepSeek Harness. This page is what a colleague needs to run it on their own machine. It assumes nothing about that machine except a shell and network access.

## What talks to what

The desktop runs a local harness. Everything account-shaped — who you are, which models you may run, your plan's remaining usage, your Studio MCP servers — comes from the **web product** over HTTPS, through a plugin called `unieai-web-gate`.

That product is a separate deployment and does not have to be on your machine. **By default the gate talks to `https://agent.unieai.com`,** so a fresh checkout on a laptop in another city works with no configuration: you sign in with a device code and the account surfaces fill in. The two being on one machine today is a coincidence of where this was first built, not a requirement.

You only need to change anything if you want to point at a copilot-v2 you run yourself. See "Pointing at your own copilot-v2" below.

## Prerequisites

**Node.js 22.19 or newer** (or 24+). This is not advisory. Under Node 20 the failures do not name the version and will send you the wrong way: `pnpm` reports *"Failed to switch pnpm to v11.7.0 — pnpm CLI is missing"*, and a direct `tsdown` reports *"Failed to import module 'unrun'"*. Neither is a broken install. Check with `node -v` before diagnosing anything else.

`pnpm` comes from the `packageManager` field; Corepack or a global `pnpm` both work.

## First run

```sh
git clone https://github.com/UnieAI/UnieAI-Agent-Desktop.git
cd UnieAI-Agent-Desktop
pnpm install
pnpm run build
pnpm uad web
```

`pnpm uad web` prints the URL it bound and opens a browser. Pass `--no-open` to keep it in the terminal, and `--port <n>` to choose the port instead of the default 3080.

Sign in from the account row at the bottom of the sidebar. It runs a device-code flow: the desktop shows a code, you approve it in the web product, and the desktop holds the session from then on.

## Working on the browser UI

The client packages under `packages/client/` are the UI. Two facts about them cost more time than anything else in this repository:

**Tests read source; the browser reads the build.** `vitest` resolves workspace imports to `src`, so a test can pass against a change the running app has never seen. After editing any client package, rebuild it — `pnpm --filter <package-name> run bundle` for one, or `npx tsdown --env.DSH_BUILD_FACE client` for all of them — and reload. If a change "does not work" and the tests are green, check the artifact's timestamp against the source's before looking anywhere else.

**`ui-primitives` is a library, not a plugin.** Its code is inlined into every consumer rather than loaded on its own, so building it is not enough: every package that imports it has to be rebuilt afterwards too. Building all of them is the reliable move.

## Pointing at your own copilot-v2

Set `productUrl` on the `unieai-web-gate` row in your profile's patch layer, at `~/.dsh/profiles/web/cordis.patch.yml`.

**A patch replaces the whole `config` of the row it targets.** Restate every key the row owns, not just the one you are changing — a patch that names only `productUrl` silently drops `enforce` and `allowedUserIds` with it.

```yaml
- action: patch
  id: unieai-web-gate
  config:
    productUrl: 'http://192.168.1.50:3000'
    enforce: true
    allowedUserIds: []
```

`packages/bundle/web-app/cordis.patch.yml` is the authority on which keys that row owns; copy the block from there and edit it.

Two notes on a self-hosted product:

- **It must be reachable from the desktop machine by that URL.** `localhost` in this file means the machine running the harness, which is not the machine running copilot-v2 unless they are the same box.
- **The desktop routes that the account surfaces need must exist on it.** They live under `app/api/desktop/` in copilot-v2. A deployment older than a route answers 404, and the affected page says so rather than looking broken.

## `allowedUserIds`

The gate can pin the host to specific accounts. The shipped bundle pins one — the machine this was first built on — and that entry is why a colleague signing in on their own checkout would be refused.

Leave it `[]` in your own patch to let the first account that signs in claim the host, or put your own user id in it. It is worth stating deliberately either way: this host runs an agent that holds bash and the filesystem tools, so who owns it is an access decision rather than a default.

## The desktop app

`apps/desktop` is an Electron window over a harness it starts itself. It adds no product behaviour: it starts `uad web` on an OS-assigned loopback port, waits for the URL line that server prints, and loads it.

```sh
pnpm --filter @unieai/uad-desktop run start
```

Packaging is per platform and refuses to cross-compile, because the closure carries native binaries chosen per platform and architecture at install time. macOS builds are made on macOS, Windows builds on Windows. See [`apps/desktop/README.md`](../apps/desktop/README.md).

## Checks

Run what your change touches rather than everything:

```sh
npx tsc --build tsconfig.client.json          # client packages typecheck
npx vitest run packages/client packages/host  # the GUI suites
npx tsx scripts/run-oxlint.ts packages/client # lint
pnpm run doc-sync                             # documentation gates
```

CI owns the exhaustive run. `pnpm run test:coverage`, not `pnpm run test`, is the coverage gate.
