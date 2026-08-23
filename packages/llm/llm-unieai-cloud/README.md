# @deepseek-ai/dsh-llm-unieai-cloud

English | [中文](README.zh.md)

Registers the signed-in UnieAI account's entitled models as one runnable `llm` route, served by the web product's metered inference relay.

```yaml
- id: llm-unieai-cloud
  name: '@deepseek-ai/dsh-llm-unieai-cloud'
```

## Why a relay, and not a provider key

The product knows which models an account may run and deliberately refuses to send a desktop the credential that would run one: a key on a laptop spends the account's provider allowance with nothing on the product able to count it. `lib/desktop/models.ts` and `lib/desktop/providers.ts` both withhold `apiKey` as a type, so there is no projection a desktop could read one from.

What the product publishes instead is `POST {product}/api/desktop/v1/chat/completions` — OpenAI-compatible, authenticated by the desktop API key, resolving the upstream server-side, enforcing the plan's quota, metering the turn, and streaming back. This package is the desktop half of that arrangement: one route, pointed at that endpoint, whose models are the account's entitlement and whose credential is the gate session's API key.

The adapter itself is `@deepseek-ai/dsh-llm-pi-ai`'s `PiAiAdapter`, built with `resolveProfiles`, `credentialStoreFrom`, and `authContextFrom` from that package. Only the two things a settings document would normally supply — the catalog and the credential — are answered from the sign-in gate instead, because both are facts about who is signed in rather than about the deployment.

## Signed out, the route offers nothing

`credentialReady` answers a definite `false` whenever `ctx.unieaiGate` holds no session. That is the seam `buildModelCatalog` drops a whole route on, and only a definite `false` drops one — `undefined` and a throw both keep the models — so answering it precisely is what makes a signed-out desktop show no cloud models instead of a menu of names that fail the moment they are chosen.

Before the first successful read the route is not registered at all, because a pi-ai route with no models cannot be resolved. After one, the route stays registered for the plugin's lifetime, signed out included: withdrawing it would make the adapter answer "not mine" — an unknown — which is deliberately not enough to hide anything.

A turn that somehow reaches a signed-out route fails with `MISSING_CREDENTIAL` naming `/auth/login`, rather than going out unauthenticated for the relay to answer with a 401 the agent loop would read as a provider outage.

## The catalog

`ctx.unieaiGate.entitledModels()` is the same list `/auth/models` serves: the union the product's own picker is built from — the account's selected personal-provider models, the models its groups grant, and the global models. Each entry becomes one model on this route:

- the model **id** is the entitled value (`${prefix}-${modelId}`), because that is what the relay resolves an upstream from and what the account is billed against;
- the **name** is the bare label, which is what a person recognises in a list; and
- **image input** is declared only where the product resolved that the model accepts it. Over-claiming would let an image be attached and then rejected mid-turn, after the message is already durable.

Capacities are the one thing neither side knows: the product reports none, and the relay is a facade over whichever upstream the account is entitled to, so there is nothing to interrogate. `defaultContextWindow` and `defaultMaxTokens` are the deployment's answer.

The list is re-read on every session change and every `catalogRefreshMs`, because entitlement changes on the product — adding an API Provider from this desktop's own Account section changes it — and nothing signals when. A read that fails keeps the previous catalog; so does an account the product reports as entitled to nothing, since an empty route cannot be resolved at all.

## Config

| Field | Default | Meaning |
|---|---|---|
| `provider` | `unieai` | The `llm` route key this plugin owns. Configurable only because route keys are global across adapter families. |
| `displayName` | `UnieAI` | Name shown by model selectors for the route. |
| `defaultContextWindow` | 131072 | Context capacity assumed for every entitled model; a guess by construction. |
| `defaultMaxTokens` | 16384 | Output capability assumed for every entitled model; the same. |
| `catalogRefreshMs` | 15 min | How often the entitlement list is re-read while signed in. Not a credential refresh — the session's API key lives as long as the session. |

## Services consumed

| Service | Usage |
|---|---|
| `ctx.llm` | Register the route and serve its requests. |
| `ctx.unieaiGate` | Read the signed-in account, its API key, and its entitled models. |
| `ctx.attachments` | Optionally resolve durable image bytes for a request, through the pi-ai adapter. |
| `ctx.credentials` | Optionally back the pi-ai credential store and ambient lookups; this route stores nothing in it. |

## Model Experience

Indirectly, through the `dsh-llm-pi-ai` adapter it registers, which owns the assembled provider request and every model-visible field in it.

#### KV Cache effect

Prefix-stable: the route adds no prompt content of its own, and a catalog refresh changes which models are offered rather than what any request contains. Selecting a model on this route sends a turn to the account's relay, which forwards it to whichever upstream the account is entitled to — so prompt-cache reuse is that upstream's, and switching between entitled values that resolve to different upstreams starts a new prefix.

## Known Limitations and Deferred Work

- **Capacities are configured, not discovered.** The product reports no context window or output cap and the relay cannot be interrogated for one, so every entitled model is sized by the same two config values. A model smaller than `defaultContextWindow` will be over-filled, and the failure arrives from the upstream mid-turn.
- **The relay's refusal codes are not translated.** `model_required`, `no_provider_for_model` (402), `quota_exceeded` (429), and `upstream_unreachable` (502) reach the agent loop as ordinary provider HTTP failures. A quota-exhausted account is therefore reported the way a provider outage is, with the reset time only in the body text; mapping them onto the harness's own error vocabulary needs a seam `dsh-llm` does not have yet.
- **A harness-specific model is offered as a plain chat model.** The product marks some entitled models with `agentHarness: studio_opencode`, meaning its own web agent runs them a particular way. They are offered here unchanged, because the relay serves plain completions for every entitled value; whether they behave well under this desktop's own loop is not something either side reports.
- **A signed-out route keeps its last catalog in memory.** Nothing is offered from it and it holds no credential, but the model names of the last signed-in account outlive that account's session until the plugin is reloaded.
- **The catalogue is polled.** There is no signal from the product when an entitlement changes, so a model added elsewhere appears here up to `catalogRefreshMs` late.
- **No per-route retry policy.** The route inherits `dsh-llm`'s normal defaults. A relay that is rate-limiting the account is retried on the same terms as a provider that is briefly unreachable, which is not necessarily right for a metered endpoint.
