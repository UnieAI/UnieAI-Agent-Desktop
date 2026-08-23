# @deepseek-ai/dsh-client-ui-unieai-providers

English | [中文](README.zh.md)

One `settings.section` entry — **API Provider Settings** — showing the UnieAI account's OpenAI-compatible providers exactly as the UnieAI Copilot web product's own page of that name shows them, plus the Add Provider control that puts a new one into the same list and the per-row edit and delete that change one already in it.

The point of the section is that there is ONE list. Every row here is a row in the web product's `user_providers` store; this package holds no copy of it, writes nothing into `settings.yaml`, and reads nothing from it. A provider added, renamed or removed here is added, renamed or removed on the web product's page for the same reason — it is the same record, not a synchronised second one.

## What a row offers, and who decided

**A BYO row opens the whole card**: display name, prefix, endpoint, credential, the enable switch, and the per-model selection, plus Delete behind a confirmation that says the provider's models go with it. The card judges only what it can judge alone — a blank name, a prefix that is not four alphanumeric characters. Whether a prefix is free and whether the row still exists are the product's answers, rendered from the identifier it refuses with.

**A Studio-managed row opens a narrower card, and says so.** The product accepts only two things on such a row — the per-model selection and the whole-provider enable flag — because its credential, endpoint and catalogue belong to the Studio binding, and it is removed by unbinding that account rather than by deleting the row. This page draws exactly those two, names the rest as Studio's, and offers no delete. That is not a duplicated rule: the rule lives in `lib/studio/managed-provider-rules.ts` beside the row and is enforced with a 409, which this page still renders if a row becomes managed between a read and a save. Drawing the full form and letting the refusal arrive afterwards would tell the reader about the rule only once they had typed into it.

**Nothing here checks a prefix, a plan limit, or a managed row itself.** A desktop cannot see the account's other prefixes, and a second copy of the product's rules is how the two would come to disagree about what a legal edit is.

## What it does not do

**It does not show local providers.** The desktop's own providers live in the Models section over `settings.yaml`, with credentials in this machine's credential store. They are a different store with a different lifecycle, and merging the two lists would tell the reader that removing a row in one place removes it in the other.

**It never receives a provider credential.** A create, and an edit whose key field was retyped, carry the API key towards the product, which is the store that will spend it. Nothing on the return path carries a key back: `ProviderRow` has no field for one, so there is no member for a later change to fill in by accident. The edit card's key field therefore starts blank and says what leaving it blank means: a blank field omits `apiKey` from the patch entirely, because an empty string would reach the product as an instruction to erase the stored credential and a rename would silently break the provider.

## How it reaches the account

Through the sign-in gate's `GET`/`POST /auth/providers` and `PATCH`/`DELETE /auth/providers/<id>`, served by [`@deepseek-ai/dsh-unieai-web-gate`](../../unieai/web-gate/README.md). The indirection is the security decision: the API key that authenticates the product's `/api/desktop/*` surface lives in that gate's session table on the host and must not reach a page, so the browser asks the host and the host asks the product.

A composition with no gate mounted answers nothing at that path, and the section renders its "could not be read" line with a Retry control. It never invents a provider and never renders an empty list in place of a failed read — an account with no providers and an account it could not ask are different facts.

The list is read once per document, and again after every write. It is re-read rather than patched: the product normalises the prefix and fetches the model catalogue while storing the row, and answers a managed row's save with the sync's view of the selection, so echoing what was submitted would show the reader something the store does not contain.

## Copy

Every line whose text the web product already publishes is copied verbatim from its `messages/{en,zh-tw,zh-cn,ja}.json`, with the source key named beside it in [`src/client/locales.ts`](src/client/locales.ts). Two products showing one list must not paraphrase each other. `API URL` and `API Key` are literals in the reference's own markup in every locale, so they are literals here. All four shipped locales carry a complete dictionary. This package's own words are the states the web page cannot be in — no session, an unreachable host, a list still loading — and the two managed-row explanations that the product publishes only as hard-coded Traditional Chinese inside its route handler: those carry that route's text character for character in zh-TW, and a translation of it elsewhere.

## Styling

CSS Modules and semantic `--dsw-alias-*` tokens only, with no literal colour and no brand hue. The routing prefix is set in the code face and spaced like one, because it is a value people copy and compare character by character.

## Model Experience

None, as the package contributes browser presentation only; the providers it lists belong to the web product and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The listed providers do not yet serve this desktop's own agent.** The section shows and adds the account's cloud providers; making them selectable models locally means materialising them as `llm-pi-ai` routes, which needs a credential the desktop deliberately does not hold. `GET /auth/models` now reports which models the account is entitled to run — see [the gate's models route](../../unieai/web-gate/README.md) — but reporting them is all it does: the product sends no endpoint and no credential with them, and publishes no per-user inference route this desktop's API key could send a turn to, so there is still nothing here a local agent could dial. Listing one in the composer's model picker would put a name in a menu that fails the moment it is chosen. Until the product grows that route, this is an account-management surface, not a model source.
- **No model-catalogue sync, and no catalogue edit.** The web product has a Sync Models control per row and a modality toggle per model; both write `modelList`, whose entries are catalogue objects rather than the plain ids this desktop's projection reports. `PATCH /api/desktop/providers/<id>` therefore refuses `modelList` outright (`model_list_unsupported`) rather than letting a desktop round-trip flatten the catalogue. A managed row's own copy still says to press Sync Models, because that line is the web product's published text and is copied verbatim; on this page there is no such control.
- **No prefix availability check before submitting.** The desktop cannot see the account's other prefixes, so a taken prefix is learned from the product's refusal rather than prevented in the field.
- **A save sends every editable field, not only the changed ones.** Two desktops editing one row therefore resolve last-write-wins, exactly as two browser tabs on the reference page do; neither side has a conflict answer to offer, and inventing one here would make the two disagree.
- **The list does not refresh on its own.** It is read once per document and after every write; a provider changed elsewhere appears on the next Retry or reload, because nothing pushes provider changes to a desktop.
