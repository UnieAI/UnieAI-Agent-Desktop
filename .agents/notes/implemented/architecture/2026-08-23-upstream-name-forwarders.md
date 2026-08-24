# Agent Note: upstream-name forwarders for the plugin ecosystem

Status: implemented

English | [中文](2026-08-23-upstream-name-forwarders.zh.md)

## Problem

Every package in this repository was renamed from `@deepseek-ai/dsh-*` to `@unieai/uad-*` ([mapping](../../../../docs/rescope.md)). The community plugin ecosystem was not, and could not be: a published plugin declares peer dependencies on the upstream names and lists them by name under `dsh.client.inject`, and those manifests are already on npm.

The consequence was not one missing feature. It was that no third-party plugin resolved at all — an ecosystem of roughly 1,900 listed plugins, unreachable, including every ready-made answer to work already scheduled here (connecting a user's own MCP server over OAuth, the plugins slated for preinstall). Nothing about those plugins is incompatible with this fork. Only the spelling of what they ask for.

## Decision

`healProfilesModuleFallback` already writes one symlink per installed package into the flat `$DSH_HOME/profiles/node_modules`, which Node's parent-walk finds from any profile. Beside each link it now also writes a **forwarder package** under that package's upstream name, whose module re-exports the target.

The upstream name is computed as the inverse of the product rescope rather than from a second list, so the two cannot drift: `@unieai/uad-X` → `@deepseek-ai/dsh-X`, `@unieai/uad` → `@deepseek-ai/dsh`, and any other `@unieai/X` → `@deepseek-ai/X`, which covers the vendored framework packages. A package from any other scope is left alone: renaming a plugin's own dependency would publish a name its author never used.

**A forwarder is a real directory, not a second symlink.** This is the load-bearing decision and it is not stylistic. Under Node's default resolution a symlink resolves to its real path, so two links to one package share one module instance and either alias would work. Under `--preserve-symlinks` the two links resolve to two paths and the package is instantiated twice: `instanceof` fails across the pair, and for `@unieai/cordis` that means two `Context` classes and no shared services. Electron's Node applies `--preserve-symlinks`, and the desktop shell runs the harness inside Electron — so a symlink alias would fail exactly where this product ships. A forwarder is a distinct module that re-exports a package loaded once, which reaches one instance under both modes.

That claim is asserted, not argued: `legacy-alias.spec.ts` builds a tree holding both a forwarder and a symlink alias, runs a probe under plain Node and under `--preserve-symlinks`, and pins that the forwarder holds in both while the symlink holds in only one.

A forwarder names a default export only where the target declares one, read from the subpath's `.d.ts` rather than by importing it — healing runs at every launch, and importing each package to inspect its namespace would execute plugin top-level code before the Loader has decided anything should load. `export *` never carries a default through, so a service package would otherwise forward no class; inventing one where the target has none would misreport a function plugin's form, which is [postmortem 0001](../../../../docs/postmortem/0001-acp-default-export-drops-inject.md).

A directory sitting at an upstream name that is not a generated forwarder is never overwritten. Healing fails loud instead: that directory is someone's installed package, and silently replacing it is the one failure this mechanism exists to prevent.

### The browser module table is the other half

The forwarders answer Node's resolution. A plugin's browser bundle does not go through Node: it is built in the plugin's own repository, and whatever its bundler marked external becomes a `require(...)` answered by this product's client module table. `springbrand-lab/dsh-oauth-mcp-client` marks `@deepseek-ai/cordis` external, so its bundle asks the table for a key the table does not have.

`makeRequire` now retries a missed specifier under `productNameFor` before failing — seed, materialized module, and registered factory, in the same order as the first attempt. A specifier matching neither name still fails loud with the message it always had, because the mapping is structural: it rewrites any name in the scope, including one this repository does not publish, so a mapped name is a candidate to try and never proof the package exists.

`dsh.client.inject` needs nothing. It is informational graph metadata for preflight display and HMR diffing; `external` carries the edges that constrain code arrival.

The two directions are exact inverses of one rule, which is why they live in `@unieai/uad-upstream-names` rather than in either consumer. The host asks "what else does this package answer to"; the browser asks "what does this request mean here". Stating the rule twice would let the two drift, and a drift here surfaces as an unresolvable import at run time rather than as a type error at build time.

## Alternatives considered

**A second symlink.** The obvious alias, and the one this rejects. Correct under default resolution, broken under Electron's — see above.

**Rescope each plugin's source at install time.** The repository already owns a reversible 255-package rename script, so this was mechanically available. Rejected: it edits third-party source, so every plugin becomes a local fork that must be re-patched on each upgrade, and a plugin installed straight from npm or git — the ordinary path — never passes through it.

**pnpm aliases or overrides in the profile manifest.** The profile is a real pnpm project and `uad plugin` is a pnpm forwarder, so `npm:@unieai/uad-X@*` entries would resolve. Rejected: it needs one entry per package in every profile, it is a file users edit, and it does nothing for the installation-owned packages that reach plugins through the fallback rather than through the profile's own `node_modules`.

**Publish alias packages to npm.** Real packages under the upstream names that depend on ours. Rejected: it squats names in someone else's scope.

## Consequences

Third-party plugins resolve unchanged, verified against the real tree: healing the actual installation produces 206 forwarders, and from a profile directory `@deepseek-ai/cordis` reaches the same `Context` class object as `@unieai/cordis` under both resolution modes. `@js2hou/dsh-mcp-manager` installs from npm into a healed profile and resolves what it declares.

The alias is one-directional and deliberately so — it lets upstream-named consumers reach this product's packages, and does not make this product answer to upstream names anywhere else.

Wildcard `exports` patterns such as `./src/*` are not forwarded: a re-export file cannot stand in for a pattern. Those are this repository's source-plane entries, read by its own tsconfig paths and gates rather than by an installed plugin.

A forwarder does not make an incompatible plugin work. It removes the name barrier; a plugin that reaches for an API this fork has changed still fails, and fails on that API rather than on resolution.
