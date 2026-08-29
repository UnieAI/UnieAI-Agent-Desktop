# Agent Note: a peer-installed upstream harness is not this installation's

Status: implemented

English | [中文](2026-08-28-peer-installed-upstream-duplicates.zh.md)

## Problem

`bunx @unieai/rabi web` on 0.1.13 died before the app started:

```
Error: dsh: /Users/…/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-runtime exists and is not a symlink;
       remove it so dsh can manage the installation fallback
    at ensureSymlink … at healProfilesModuleFallback
```

The directory it refused to touch was one this code wrote: a forwarder from the [upstream-name forwarders](2026-08-23-upstream-name-forwarders.md) mechanism. What changed underneath it was the closure.

0.1.13 ships `@changfenhuang/dsh-genui` in the web-app bundle. That plugin is published against the upstream harness, so it declares thirteen `@deepseek-ai/*` peer dependencies. **npm 7+ and bun both install missing peers.** Installing this product therefore downloads a second, complete copy of the harness — `@deepseek-ai/cordis`, `dsh-agent`, `dsh-api-gateway`, and the rest — beside our own.

`healProfilesModuleFallback` walks `dependencies` and `peerDependencies` to build the flat fallback, so those packages entered the closure. It then tried to link `@deepseek-ai/dsh-client-runtime` at the exact path where a previous launch had written the forwarder for `@unieai/uad-client-runtime`, and stopped the boot.

The crash is the visible half. The invisible half is worse: had the path been free, the link would have been created, and the plugin would have resolved a `Context` class and a service registry from a harness it was never loaded into. `instanceof` fails across that pair and no service resolves — the exact failure the forwarders exist to prevent, arriving silently instead of loudly.

## Decision

**Deliberateness decides which package owns an upstream name, and the app manifest is where deliberateness is recorded.**

`healProfilesModuleFallback` drops a closure entry when all three hold: the name is an upstream name this product's rename claims (`productNameFor` resolves it), the product package it maps to is itself in the closure, and the app manifest does not declare that upstream name directly. The forwarder then claims the name, as it did before the duplicate arrived.

The three conditions are each load-bearing:

- **A name with no product counterpart is untouched.** An upstream package this fork never renamed is a real dependency, not a duplicate; dropping it would break the install that asked for it.
- **A name the app itself declares is untouched.** Someone installing `@deepseek-ai/dsh-tools` alongside ours chose it, and it keeps its name — the rule `profile.spec.ts` has pinned since the forwarders shipped. What arrives further down the graph was chosen by a package manager satisfying somebody else's peer range, not by this installation.
- **The product counterpart must be present.** Without it there is nothing for a forwarder to forward to, and the upstream copy is all there is.

**A forwarder this code generated is replaceable; anything else at that path is not.** `ensureSymlink` now removes a directory carrying the `dshLegacyForwarder` marker and writes the link, and still throws for a directory without it. The marker already existed for the mirror-image case — `ensureLegacyForwarder` refuses to overwrite an installed package — so the two directions now read the same rule from the same fact. A directory this code wrote must never become a permanent hard stop that only a human with a shell can clear; the person meeting it has done nothing wrong.

That second half is a safety net rather than the fix. With the closure filter in place the collision no longer arises for names this product owns, but the state it produced is on real machines, and an installation that upgrades into it has to heal itself.

## Alternatives considered

**Let the installed upstream package win, and drop the forwarder.** The rule that was already there, and the one the crash came from. It is right when a human installed the package and wrong when a package manager did, and nothing at the linking step can tell those apart — which is why the decision moved to the app manifest, where the difference is recorded.

**Skip upstream names during the closure walk entirely.** Simpler, and it silently breaks the deliberate case: an installation that genuinely depends on an upstream package would find the name answered by a forwarder onto a different package.

**Stop `peerDependencies` from entering the closure.** They are there for a reason recorded in `healProfilesModuleFallback`: out-of-tree plugins reach Service Definition packages (`dsh-compaction`, `dsh-invariants`) only as peers of the providers that implement them. Dropping the edge would unresolve the plugins this whole mechanism exists to serve.

**Drop the plugin from the bundle.** Removes the duplicate download by removing the feature. Rejected: GenUI is why the bundle carries it.

## Verification

`profile.spec.ts` covers the shape that failed and each boundary around it: a peer-installed duplicate left to its forwarder, an upstream name with no counterpart still linked, a generated forwarder replaced when the closure genuinely claims that name, and an installed package at that path still refused with its contents intact. Removing either half of the fix turns one of them red.

## The plugin is vendored, so the duplicate is never downloaded

The resolution rule above makes the install CORRECT; it does not make it small. The peers are installed whether or not anything links them, so a `bunx` of this product still paid for 184 packages, 73 of them a second harness.

So `@changfenhuang/dsh-genui` is now vendored: `vendor/genui/`, pinned source, republished as `@unieai/genui` with its imports rescoped. Nothing declares an upstream peer any more, and `pnpm-lock.yaml` holds zero `@deepseek-ai/` entries.

**`vendor/` rather than `packages/`** — not because a community plugin is framework, but because the deciding property of that directory is code this repository does not shape. The gates on `packages/` are written for code we author: per-file coverage, export JSDoc, the invariant companion. Putting third-party source there means either editing 47 files of somebody else's code to satisfy them — which is what makes the next upstream sync expensive — or accumulating exemptions. `vendor/` is already out of scope for those, and its release family already publishes on the upstream version line. `vendor/README.md` states the broadened charter.

**The sync is a script, not a procedure.** `pnpm run sync-vendor-genui <version>` fetches a published version, replaces the copy wholesale, and applies the rewrite. Two of its rewrites are load-bearing and are asserted rather than trusted: the host serves the lazily fetched mermaid/three/echarts bundles at `ASSET_ROUTE_PATH`, the client fetches them from `PLUGIN_ID`, and the two constants live in different faces with the package name spelled into each. Rescoping one and not the other leaves the fence drawing its light half while every heavy renderer 404s — which is exactly what the first hand-run of this rewrite did, and what the assertion now refuses to ship.

The copy is 0.9.6, not the 0.9.3 the bundle depended on: a sync is cheapest at the moment the tooling for it is being written.

### Verification

Against a running `rabi web`: the served HTML preloads the plugin's `client.js`, that bundle answers 200 with the bytes this repository built, all three engine bundles answer 200 under `/plugins/@unieai/genui/assets/`, and the upstream-named route answers 404. Every built artifact is within 0.1% of the size upstream publishes for the same version, which is what the rescoped import names account for.

## Consequences

An out-of-tree plugin that genuinely depends on an upstream package still gets it: the deciding fact is now written in the app manifest, where a person put it, instead of being guessed at the linking step. The cost is that the manifest is load-bearing in a way it was not before — an app that forgets to declare an upstream dependency it really has will see the forwarder win, and the symptom is a plugin resolving against our package rather than a crash.

Vendoring bought back 184 packages and 73 MB of second harness per install, and cost a sync script plus a pinned copy that ages. The rewrite it applies is asserted rather than trusted, so the failure mode of an upstream change is a refused sync rather than a silently half-rescoped bundle.
