# Agent Note: the UnieAI account's API Providers in the desktop

Status: implemented

English | [中文](2026-08-22-unieai-cloud-providers-in-the-desktop.zh.md)

## Problem

The UnieAI Copilot web product has an "API Provider Settings" page over `user_providers`: OpenAI-compatible endpoints the account owns, each with a globally unique four-character routing prefix, a stored credential, and a model catalogue. The desktop has a Models page of its own over `settings.yaml` and `ctx.credentials`. The two are different stores with different credential lifetimes, and the desktop could not see the account's list at all.

"Show the same providers, and be able to add one that appears on both sides" reads like a synchronisation request, and synchronising two independent stores raises three questions that have no default answer: what a provider's identity is across them, what happens when one row is edited on both sides, and whether provider credentials move between a server-side store and a laptop.

## Decision

**No synchronisation. One store, mirrored.** The web product's `user_providers` stays the sole owner of an API Provider. The desktop holds no copy: it reads the list per document and re-reads it after a create, and writes nothing about these providers into `settings.yaml`. A row shown in the desktop and a row shown on the web page are therefore the same record, which is why an addition made in the desktop appears on both sides — not because anything was copied.

**Identity is the product's row id, plus the prefix as the human handle.** Nothing is minted locally. `user_providers.id` keys the list; `prefix` is what people copy and compare, so it is rendered in the code face and is the value refusals talk about.

**The conflict question is dissolved rather than answered.** The desktop offers no edit and no delete. That is not a UI omission — the host route serves only `GET` and `POST`, and the product route the host calls has no `PATCH` or `DELETE` counterpart. A create either takes a free prefix or is refused as a duplicate, which is a verdict the store already gives; a concurrent edit of one row would have needed an invented tie-break, and neither last-write-wins nor a merge is acceptable when one of the fields is a credential. Editing stays where the whole account is visible, and the section says so in one line.

**A platform-managed provider is out of reach twice over.** `user_providers.managedSource` (a linked UnieAI Studio catalogue, owned by the product's own sync) arrives projected as `managed: true`; the desktop labels it with the product's own explanation and offers nothing to change. The enforcement is not the label — it is the absent write. An unflagged row is read as managed, so a host or product one deploy behind cannot make a managed row look editable.

**Credentials move one way only.** A create carries the API key the person just typed towards the product, which is the store that will spend it — the same act as typing it into the web dialog, initiated deliberately, from a form that says whose providers these are. Nothing carries a credential back. This is stricter than the browser route, which shows a BYO row's own key back in a reveal field: the desktop projection has no `apiKey` member at all, on any row, so there is no field for a later change to fill in. Copying a server-held secret onto a laptop would widen its blast radius with nothing on the other side of the trade, and a managed row's key — a live Studio runtime credential — was never the user's to copy in the first place.

**The seam is the sign-in gate, as `/auth/account` already is.** The API key authenticating `/api/desktop/*` lives in the gate's session table on the host and must not reach a page, so the browser asks the host at `/auth/providers` and the host asks the product. The provider credential a create carries rides the same path. Refusals travel as the product's own stable identifiers (`prefix_taken`, `byo_provider_limit_reached`, ...) rather than as prose, because only the browser knows the reader's language; the browser half maps each to one line and shows an unrecognised identifier as the generic save failure.

## Consequences

- The desktop gains a second settings section, ordered after Models. Models remains the desktop's own provider surface and is what a local agent runs on; this one is the cloud account's list. Neither list contains the other's rows, so removing something in one place cannot look like removing it in the other.
- `POST /api/desktop/providers` enforces exactly what the browser create path enforces — the plan's BYO limit, the three-way prefix uniqueness that `user_providers` has no index for, and the best-effort `/v1/models` fetch — by calling the same helpers rather than restating the rules. It additionally bounds the submitted strings and refuses an endpoint that is not an absolute `http(s)` URL, because a desktop request is not typed into a form this server rendered.
- Copy is copied verbatim from the product's `messages/{en,zh-tw,zh-cn,ja}.json`, with the source key named beside each line, in all four shipped locales. Two products showing one list must not paraphrase each other.
- The providers in this list do not yet serve the desktop's own agent. Making them selectable models means materialising them as `llm-pi-ai` routes, which needs a credential the desktop deliberately does not hold; until that lands this is an account-management surface, not a model source.
- Nothing pushes provider changes to a desktop, so a provider added elsewhere appears on the next retry or reload.

## Alternatives considered

- **Mirror the list into `settings.yaml` as `llm-pi-ai` routes, pulling each provider's key down with it.** Rejected on the credential decision above: it moves server-held secrets — including managed rows' live Studio runtime keys — onto a laptop, and it recreates exactly the two-store reconciliation the mirror avoids. The materialisation is still the right eventual shape for making these providers usable locally; what it must not carry is the secret.
- **A full editor mirroring the web page, with last-write-wins.** Rejected: the losing write silently discards a field that can be a credential or an endpoint, and the user is never told which of their two edits survived. A version check instead of a timestamp would only turn the silent loss into a conflict dialog for a surface that has no reason to exist on a desktop.
- **Merge the cloud list into the existing Models section.** Rejected: the two lists have different owners, different credential stores, and different removal semantics. One list would have to explain per row which of those applied, and a reader would reasonably expect a delete in one place to take effect in the other.
- **Let the browser call `/api/desktop/providers` directly with the desktop key.** Rejected outright — it puts the key that authenticates the whole desktop surface into a page. This is the decision `/auth/account` already made.
- **Check prefix availability in the desktop before submitting.** Rejected: the desktop cannot see the account's other prefixes, and a locally cached answer would be wrong the moment another client claimed one. The product's refusal is the only correct source.
