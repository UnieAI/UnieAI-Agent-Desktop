# Agent Note: The first-party UnieAI Studio entry on the Plugins page

Status: implemented

English | [中文](2026-08-23-first-party-studio-plugin-entry.zh.md)

## Problem

The Plugins page states no plugin of its own. `DirectoryArea` renders whatever `/auth/plugins` lists, `StudioMcpArea` renders whatever `/auth/mcp` lists, and both components refuse to name a plugin, a category, or a publisher: a row written into the client would be this package asserting that something exists in a catalogue the product owns, and the catalogue is the only authority on that.

The refusal left one real thing unrepresented. UnieAI Studio is not a catalogue entry — it is this product's own account link, the one that supplies the Studio model catalogue, the account's own runtime key, and the Studio MCP tools the page already draws further down. A reader who has not bound Studio has no way to learn from this page that the link exists, what it would give them, or where it is made, and a reader who has bound it sees the tools without ever seeing what they came from. Neither fact is a claim about anyone's catalogue; both are facts about this product, true in every deployment.

The page also had no reachable answer to "am I bound". `/auth/mcp` already carries it — the product lists a server with id `unieai-studio` only for a linked account — but the page treated that row as one MCP server among any others and drew no conclusion from its presence or absence.

## Decision

**The page carries exactly one entry whose existence is fixed, and only its existence.** `plugins.page.area` gains an entry at id `unieai-studio`, order -20, registered by this package and listed first on the `directory` destination — above the catalogue, because it is this product's own integration and the destination below it is everyone else's. `studio-entry.ts` states the rule that makes this an exception rather than a precedent: an entry may be stated when it is a fact about this product rather than a claim about a catalogue, and everything it displays must still be read.

**Everything it displays is read, from the source that already existed.** The entry binds the same `StudioMcpSource` instance `StudioMcpArea` binds — one object injected into two registrations — so the entry and the area can never disagree about the account. No second reader, no second route, no second cache. `readStudioBinding` is a pure projection of `StudioMcpState`, not a fetch.

**Bound is the presence of the product's own row.** `/auth/mcp` forwards `GET /api/desktop/mcp`, which lists `unieai-studio` only for an account holding a Studio link. So a settled list containing that row is `bound` and carries the row; a settled list without it is `unbound`; and the four readings that carry no list at all — `loading`, `signed-out`, `unsupported`, `failed` — keep their own names, because none of them says anything about whether a link exists. A signed-out desktop is neither bound nor unbound and says so. The id is matched verbatim, never by prefix: a prefix match would adopt an unrelated server whose id happens to start the same way.

**The bind action appears for exactly one reading.** `unbound` draws 綁定 / Bind as an `<a target="_blank" rel="noopener noreferrer">`; `bound` draws the connected word and the tool names the account's own server reported; `signed-out` asks for a sign-in instead, because binding is an account link and the button would land on a login; `failed` offers the retry, the only one of the four a retry can fix. `bound` with an empty catalogue says the server reported no tools rather than drawing an empty strip, and no description is invented for a tool the host named in one word.

**The bind target is `https://agent.unieai.com/settings#profile`.** The path is confirmed against the product: `components/settings/studio-link-card.tsx` runs the whole OAuth device grant against Studio and is mounted on the Profile tab of the product's settings page, and `settings-client.tsx` reads `#<tab>` on load and on `hashchange`, so the hash deep-links to the card. No locale segment: the product's `next-intl` routing runs `localePrefix: 'always'`, so a prefix-less path is redirected to the visitor's own negotiated locale, and writing one here would override the language they chose on the product. The origin is the `unieai-web-gate` `productUrl` default, which is also what `packages/bundle/web-app/cordis.patch.yml` configures for the shipped desktop — see [Consequences](#consequences) for what that costs a self-hosted deployment.

**The mark is inlined.** A 754-byte pixel-art PNG as a `data:` URI in `studio-entry.ts`, drawn in a 40px tile with `image-rendering: pixelated`. Inlined because the client bundle purity gate forbids this package reaching outside itself for a runtime asset and because the desktop runs offline against a local harness; pixelated because every default smoothing filter turns the source's one-pixel edges into grey fringes at tile size.

## Why this one entry is hardcoded when the page refuses to hardcode others

The rule the page enforces is not "never write a row in the client". It is **never assert the contents of someone else's catalogue**. Those are different rules, and the difference is what makes this entry admissible while a "Featured" heading, a curated marketplace row, or a publisher group remains inadmissible:

- **A catalogue row is a claim that can be wrong.** `/auth/plugins` decides what exists, who published it, and what category it sits in. A row written here would be right until the catalogue changed and wrong afterwards, with nothing to detect the drift. The Studio entry names nothing the catalogue owns.
- **This entry's existence cannot be wrong.** The Studio link is a feature of this product, present in every deployment of it, whether or not any account has used it and whether or not any catalogue route answers. Stating it asserts nothing about the world beyond the product the desktop is a client of.
- **Everything mutable about it is still read.** The binding, the tool names, the tool count, and whether there is an account at all come off the wire. The fixed part is a name, a sentence, an icon, and a URL — and the URL is the one of those with a known limitation, recorded below rather than hidden.
- **The unbound state is the whole reason it must be stated.** A read-only entry would vanish for exactly the readers it exists for: an account with no Studio link gets a listing that does not mention Studio, so a page that only rendered the wire could never tell them the link exists. The refusal to hardcode would have hidden a real capability rather than protected a real catalogue.

## Testing

`tests/studio-entry.client.spec.tsx` pins each reading against the rendered DOM: bound names the reported tools and offers no bind action; unbound offers the action, targets `https://agent.unieai.com/settings#profile`, and opens beside the desktop rather than navigating away from it; signed-out draws neither a bound nor an unbound claim and no action; loading, unsupported and failed each draw their own line, with the retry only on the last. A listing carrying only other servers reads as unbound, and `unieai-studio-staging` does not satisfy the id. `readStudioBinding` is pinned directly for the four listless readings and for handing the bound reading the row the product sent. `tests/styles.client.spec.ts` pins `image-rendering: pixelated` with the tile size, the success colour on the connected word, the shared install pill on the bind action, and the absence of any scroll container in the sheet.

## Alternatives considered

**Read the product origin instead of writing it.** Rejected as unreachable from this package: no route the browser may call reports the configured `productUrl`. `/auth/mcp` publishes a server's origin only for servers an account already has, which is by definition not the unbound account the bind action is drawn for; `/auth/account`, `/auth/session` and `/auth/bootstrap` carry no origin; and client plugins take no `Config`, so a cordis.yml field cannot reach the browser either. Publishing `productUrl` from the gate would close this, and it is a `unieai-web-gate` change rather than a page change.

**Render a plain instruction instead of a link.** Rejected because the destination is confirmed, not guessed: the binding card, its page, and its deep-link mechanism were all read in the product source. A sentence telling the reader to find the settings page themselves would be strictly less than a link that reaches it, and the one thing the link can get wrong — a repointed `productUrl` — is a deployment the sentence would not have helped either.

**Guess a dedicated binding path such as `/settings/studio` or `/link/studio`.** Rejected outright. No such route exists in the product; an invented path would 404 on the deployment this ships against, which is worse than the settings page that actually holds the card.

**Add a second source that reads the binding directly.** Rejected: `/auth/mcp` already answers the question, `StudioMcpSource` already models the signed-out and unsupported readings, and a second reader would double the requests and create two states that could disagree about one account.

**Put the entry on the configuration destination beside the Studio MCP area.** Rejected because the two answer different questions. The configuration destination says what this install already consists of; the entry says what this account could add and gives it the gesture to add it, which is the directory destination's question.

**Fetch the icon from the product.** Rejected twice over: the client bundle purity gate forbids the outside reference, and a remote image renders broken exactly when the network is what failed on a desktop that runs offline against a local harness.

**Translate the product name.** Rejected, following the file's own precedent for `Studio MCP`: the name is a literal in all four dictionaries, because a translated product name reads as a different product.

## Consequences

The page now answers "is Studio bound" without a reader opening the configuration destination, and an unbound account is told what the link gives and where it is made. The entry costs no additional request: it projects a reading the page already performed.

The bind action always points at `https://agent.unieai.com`, so a deployment that repoints `productUrl` at its own copilot-v2 (`docs/unieai-development.md`) sends this one link to the public product. This is recorded in the package README's Known Limitations with the closing condition: the gate publishing its `productUrl` to the browser. Every other user-visible fact on the entry is deployment-correct, because every other fact is read.

The page now has one stated entry, and the rule that admitted it is written where the next reader will meet it (`studio-entry.ts`, the package README). A second stated entry has to satisfy the same test — a fact about this product, not a claim about a catalogue — or it does not belong.
