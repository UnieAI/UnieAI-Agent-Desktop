# @unieai/uad-mcp-servers

English | [中文](README.zh.md)

Mounts the MCP servers a person added themselves. The list lives in the user settings document under the `mcp.servers` namespace; this plugin keeps the set of mounted [`@unieai/uad-mcp-client`](../mcp-client/README.md) instances equal to it, live, without a restart.

## Usage

```yaml
- mcp-servers:
    toolCallTimeoutMs: 60000
```

The plugin does nothing without a `settings` provider: no provider means no durable list and nothing to mount. That is a composition without user-configurable servers, not a fault.

## Config

| Field | Type | Default | Meaning |
|---|---|---|---|
| `toolCallTimeoutMs` | `number` | `60000` | Per-tool-call timeout handed to every mounted server. |

One timeout for the whole list rather than one per row: a person adding a server is answering "where is it", and a timeout is a deployment's judgement about its own machine, not part of the address.

## The stored list

Each entry carries a `name`, a `url`, a `token`, and `enabled`. The name becomes the prefix of every tool the server publishes (`mcp__<name>__<tool>`), so it is a model-facing identifier rather than a label: `[A-Za-z0-9_-]{1,32}`, unique across the list.

`problemsWith` reports every fault in an entry rather than the first, because a form that surfaces one problem per attempt makes someone fix three things in three round trips. `mountable` skips a disabled or invalid row and mounts the rest — the list is a working document, and one row someone is still typing must not stop the four that are ready.

`http:` is accepted alongside `https:`. A server on loopback is the ordinary case, and refusing it would push people towards a proxy that adds nothing.

## Streamable HTTP only, deliberately

`mcp-client` also speaks stdio, which starts a server by running a command. Offering that in a form would turn an "add a server" field into a way to run any program on the machine — from a page, with the agent's own privileges, and with nothing in the transaction that looks like consent to execute. A URL is a different kind of thing: it reaches something already running that someone else already decided to run. A person who genuinely wants a stdio server can still declare one in the profile's own patch layer, where the act is explicit and reviewable.

## Reconcile, do not restart

A settings write remounts only the servers whose `name`, `url`, or `token` moved (`differs`). Toggling an unrelated row, or editing one that is still invalid, leaves live connections alone; rebuilding the whole set on every keystroke would drop every tool those servers publish for the duration. Writes are serialized, so two changes in flight cannot interleave a mount and an unmount of the same name.

A server that fails to start is logged and dropped from the mounted set rather than failing the plugin: one unreachable endpoint must not take the others down, and `mcp-client`'s own reconnect loop is the right owner of a transient outage.

## Relationship to the account's servers

`unieai-mcp-supervisor` mounts what the UnieAI product says this account has connected, with a bearer the product mints and the browser never sees. This plugin mounts what the person typed on this machine, with a token they typed. The two are deliberately separate services over the same `mcp-client`: one is account state that arrives and expires, the other is local configuration that changes only when someone changes it. Merging them would make an account outage look like a lost setting.

## Services consumed

- `settings` (optional) — registers the `mcp.servers` namespace and observes it.
- `tools` — reached indirectly; every mounted `mcp-client` instance registers there.

## Model Experience

### The tools of every mounted server

#### What the model sees

Nothing from this plugin directly. Each mounted server's tools reach the model through `mcp-client` exactly as a profile-declared server's would, under `mcp__<name>__<tool>`. What this plugin decides is which servers are mounted at all, and therefore which of those tool sets exist in a request.

#### Token effect

Data-dependent, and owned by the servers a person chose: each mounted server's schemas are paid on every request while it is mounted. Disabling a row removes its tool definitions from subsequent requests; adding one adds them.

#### KV Cache effect

A mount or unmount changes the tool definitions in the request prefix, so the first request after a list change invalidates the cache. Changes are user-initiated and infrequent, and a settings write that moves nothing this plugin mounts on (`enabled` alone, or an invalid row) does not remount and therefore does not invalidate.

## Known Limitations and Deferred Work

- **Tokens are stored in the settings document** — like every other value there. This file already holds provider credentials and the harness reads it as the person who owns the machine; a token the desktop cannot read is a token it cannot send. Moving them to the credential service would separate them from the row that uses them, and is deferred until the [credential seam](../../credentials/credentials/README.md) is the store for user-entered secrets generally.
- **No OAuth** — an entry carries a static bearer, so a server requiring an authorization code flow cannot be added here. The official MCP SDK ships an `OAuthClientProvider` seam that `mcp-client`'s transport already accepts; wiring it is a separate change.
- **No browser UI yet** — the list is durable and reconciles live, but nothing yet renders a form over it, so entries currently arrive by editing the settings document.
- **A renamed server remounts** — the name is the mount identity, so changing it disposes the old connection and dials a new one rather than relabelling in place.
