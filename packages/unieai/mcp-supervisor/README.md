# @unieai/uad-unieai-mcp-supervisor

English | [中文](README.zh.md)

Mounts the MCP servers the signed-in UnieAI account grants, one `dsh-mcp-client` instance per server, and keeps them mounted as their bearers expire.

The web product hosts MCP servers on its users' behalf and hands a desktop a short-lived per-user bearer for each one. `dsh-mcp-client` can dial exactly such a server, but it is configured from `cordis.yml`, and a composition file can know neither which servers an account has connected nor a credential minted per sign-in. This package is the piece between them.

```yaml
- id: unieai-mcp-supervisor
  name: '@unieai/uad-unieai-mcp-supervisor'
```

## Where the servers come from

`@unieai/uad-unieai-web-gate` provides `ctx.unieaiGate`, whose `mcpServers()` proxies the product's `/api/desktop/mcp` with the gate session's API key. That is a HOST-side read: the grant it returns carries the endpoint and the bearer, neither of which the gate's own `/auth/mcp` route sends to a browser. A page gets an origin and a tool list; this package gets what it takes to dial the server.

These are servers the product hosts and proxies. An account's own remote MCP entries are not among them and cannot be: the product publishes those as an origin only, because a remote MCP URL routinely carries a token in its path.

## Expiry, and why a refresh is a re-mount

Each bearer is good for about an hour, and `expiresAt` says when. A mounted server whose bearer lapsed fails every call with no other signal — no disconnect, no reconnect, just refusals — so waiting to be told is not an option.

The supervisor re-reads the list ahead of the earliest expiry it holds, minus `refreshSkewMs`, clamped between `minRefreshMs` and `maxRefreshMs`. An unreadable or already-past expiry collapses to the floor: a product build that reported no timestamp still handed out a token that stops working, and the only safe reading of an unknown lifetime is a short one.

A re-read always mints a fresh bearer, and `dsh-mcp-client` captures its headers at construction with no seam for replacing them. So the only way to move a new bearer onto a connection is a new connection: the instance is disposed and mounted again, in that order, because the tool namespace it reserves cannot be held twice. The alternative — leaving the old connection up — is a server that is silently broken rather than briefly absent.

A read that fails changes nothing. Whatever is mounted keeps working until its grant actually lapses, and the next attempt is `retryDelayMs` away; dropping every tool because one HTTP call failed would turn a momentary outage into a loss of the account's whole toolset.

## Lifecycle

| Event | What happens |
|---|---|
| Plugin mounts | One read immediately — a session may already exist, since reloading the plugin tree signs nobody out. |
| `unieai-gate/session` | A read, whichever direction the session moved. |
| Refresh timer | A read, scheduled from the earliest expiry held. |
| Signed out | Every instance is released; no further reads until a session returns. |
| Fiber disposed | Every instance is released, after any reconciliation in flight settles. |

A grant whose `id` is not a legal tool namespace (`[A-Za-z0-9_-]{1,32}`) is skipped with a warning rather than handed to `dsh-mcp-client`, which would fail its own load over it and take that read's remaining servers with it.

## Config

| Field | Default | Meaning |
|---|---|---|
| `refreshSkewMs` | 5 min | How far ahead of the earliest expiry to re-read. The margin covers the read, the disconnect, and the reconnect. |
| `minRefreshMs` | 30 s | Floor on the wait; also what covers an unreadable or already-past expiry. |
| `maxRefreshMs` | 30 min | Ceiling on the wait. It bounds how long a grant can go unchecked, and it is what paces the read when nothing is mounted, so a newly connected server is noticed without a signal from the product. |
| `retryDelayMs` | 60 s | Wait after a failed read. Separate from the floor because a failed read says nothing about when the grants lapse. |
| `toolCallTimeoutMs` | 60 s | Per-tool-call timeout handed to every mounted instance. |

## Services consumed

| Service | Usage |
|---|---|
| `ctx.unieaiGate` | Read the signed-in account and the MCP grants it holds. |

Each mounted instance injects `ctx.tools` on its own; this package never touches the tool registry directly.

## Model Experience

Indirectly, through the `dsh-mcp-client` instances it mounts, which own every discovered tool's name, schema, and result.

#### KV Cache effect

Prefix-stable while the mounted set and its discovered tools are unchanged. Each refresh cycle re-mounts every server whose bearer was re-minted, and a re-mount that recovers an identical tool list reproduces identical definitions, so the hourly cycle is prefix-stable on its own; a cycle in which the account's servers or their tools actually changed replaces definitions and may invalidate reuse from the first changed schema token.

## Known Limitations and Deferred Work

- **A refresh cycle drops the connection.** `dsh-mcp-client` captures its headers at construction, so a new bearer needs a new instance. Tools are absent for the moment between disposal and the replacement's discovery, and an in-flight call on the old instance fails. Closing that gap needs a header-refresh seam on `dsh-mcp-client`, which no other consumer wants yet.
- **The ceiling, not the skew, usually decides the schedule.** The product mints hour-long grants and `maxRefreshMs` defaults to 30 minutes, so the ordinary cycle re-mounts at half the grant's life rather than five minutes before its end. That is safe and deliberate — the same timer is what notices a newly connected server — but it costs one extra re-mount per grant.
- **An idle session's lapse is not observed.** Gate sessions expire on idleness, and that expiry is evaluated on read, so nothing announces it. This package notices at its next scheduled read, and until then holds instances for an account that is no longer signed in. Those instances still work: the MCP bearers are the product's and outlive the browser session.
- **Only the product's own servers are mountable.** An account's personal remote MCP entries are published as an origin, never an endpoint, so nothing here could dial one. Changing that is the product's decision, not this package's.
- **No user-visible surface.** A server that is skipped for an illegal id, or one whose connection is failing, is reported only as a host log line. The plugins page reads `/auth/mcp`, which reports what the account is granted rather than what this host actually mounted.
