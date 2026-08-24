# @unieai/uad-upstream-names

English | [中文](README.zh.md)

The mapping between this product's package names and the upstream harness names they answer to. Two pure functions, no dependencies.

## Why it exists

Every package in this repository was renamed from `@deepseek-ai/dsh-*` to `@unieai/uad-*` ([mapping](../../../docs/rescope.md)). The community plugin ecosystem was not, and could not be: a published plugin declares peer dependencies and bundler externals under the upstream names, and those manifests are already on npm. Nothing about those plugins is incompatible with this fork — only the spelling of what they ask for.

Two faces need that mapping and reach it from opposite directions, which is why it lives in neither of them:

- **The host** publishes each installed package under its upstream name as well. [`healProfilesModuleFallback`](../../boot/app-boot/README.md) writes a forwarder package per installed package, named by `legacyNameFor`.
- **The browser module table** answers an upstream request with the product package: when a plugin bundle requires a specifier that misses the table, `@unieai/uad-client-modules` retries under `productNameFor` before failing.

Stating the rule twice would let the two drift, and a drift here surfaces as an unresolvable import at run time rather than as a type error at build time.

## API

| Export | Meaning |
|---|---|
| `legacyNameFor(name)` | The upstream name a product package answers to, or `undefined` for another scope. |
| `productNameFor(name)` | The product package that answers to an upstream name, or `undefined` for another scope. |
| `UPSTREAM_SCOPE` / `UPSTREAM_PREFIX` | `@deepseek-ai` / `dsh`. |
| `PRODUCT_SCOPE` / `PRODUCT_PREFIX` | `@unieai` / `uad`. |

The two functions are exact inverses, asserted by a round-trip test. Three arms cover every name: the bare product package (`@unieai/uad` ⟷ `@deepseek-ai/dsh`), the prefixed harness packages (`@unieai/uad-tools` ⟷ `@deepseek-ai/dsh-tools`), and the vendored framework packages, which carry no prefix and change only their scope (`@unieai/cordis` ⟷ `@deepseek-ai/cordis`).

A name from any other scope maps to `undefined` in both directions. A plugin's own dependencies pass through these functions, and rewriting one would name a package its author never published.

## Model Experience

None, as this is a pure name mapping for module resolution; nothing here reaches a model request.

#### KV Cache effect

None; nothing here enters a request prefix.

## Known Limitations and Deferred Work

- **The mapping is structural, not a registry** — it rewrites any name matching the scope arms, including one this repository does not publish. Callers treat a mapped name as a candidate to try, never as proof the package exists.
- **One upstream vocabulary** — a fork renamed from a different upstream would need its own scope constants; the arms are not parameterized because a second upstream has no current consumer.
