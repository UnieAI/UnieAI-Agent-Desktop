# Model Vision

English | [中文](model-vision.zh.md)

What a text model does about the things it cannot see. Two model-facing packages sit here — [`tool-page-capture`](../../packages/browser/tool-page-capture/README.md) (`page_screenshot`, a picture of a web page) and [`tool-image-inspect`](../../packages/llm/tool-image-inspect/README.md) (`image_inspect`, one question answered by a vision route). They are separate plugins with separate seams; they share this page because they are the two halves of one story: **getting** a picture, and **reading** one.

Neither is part of the agent-loop spine, and neither is a service. Both are consumers: `page_screenshot` writes into [`ctx.attachments`](attachment.md), `image_inspect` reads from it and calls [`ctx.llm`](llm-streaming.md). The picture that crosses between them is an `AttachmentId` and its metadata — never bytes in a tool result, never a path.

## `page_screenshot` — getting the picture

The capture launches a browser for **one call** and discards it: a fresh profile, a fresh process, torn down before the tool returns. Nothing survives to carry one page's cookies into the next page's picture, which is why this is not the person's browser ([operator-browser.md](operator-browser.md)) under a different name — that one is long-lived, driven by a person, and has no model-facing side.

Only `http` and `https` addresses are capturable. `file:`, `data:`, and every other scheme are refused as `BLOCKED_URL` before a browser starts, so the tool cannot be pointed at the local disk to read a file the filesystem seam would have gated.

The result carries the stored reference plus what the picture claims about itself — width, height, byte length — and the tool renders a text envelope beside the image block so a model without image input still learns that a capture happened and what it was of.

## `image_inspect` — reading one

The turn keeps its own model. One question, one image, and one delegated call go to the configured vision route; the answer comes back as text into the calling turn. Nothing about the session's model selection changes, and the route is named in the output beside the answer — an answer about a picture is only as good as the model that looked.

The plugin mounts **dormant** when no `provider`/`model` is configured, the way `llm-pi-ai` mounts with no providers: a deployment with no vision model offers no `image_inspect` rather than offering one that fails every call. Before each call it re-checks that the route still declares `image` input, so a model list that changes under the harness produces a refusal, not a malformed request.

A picture the PERSON attached takes the same path when the session's model cannot see. The host admits and stores the attachment as usual, then hands the model a text stub carrying the exact `image` object the tool takes, so the model asks its own question about it. It refuses the message only when no `image_inspect` is registered at all — with nothing to delegate to, admitting the image would drop it silently at request assembly.

Image size is **not** this package's business. The adapter already reduces every image against the target model's own `imagePixelBudget`/`imageMaxBytes` when it reads the attachment ([attachment.md](attachment.md)); compressing again here would shrink a picture twice against two different budgets.

Source: [`packages/llm/tool-image-inspect/src/index.ts`](../../packages/llm/tool-image-inspect/src/index.ts)

Both packages register tools and emit one observation event each; neither provides a service — everything below is generated from the two `Events` merges.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="tool-image-inspect-events"></a>

### `tool-image-inspect/*` events

<a id="tool-image-inspectdelegated--emit"></a>

#### `tool-image-inspect/delegated` — emit

One question delegated to the vision route.

Carries the route and whether it declared image input, so the invariant beside it can check the tool's own gate rather than repeat it.

```ts cordis-catalog
/**
 * One question delegated to the vision route.
 *
 * Carries the route and whether it declared image input, so the invariant
 * beside it can check the tool's own gate rather than repeat it.
 * @param route - `provider/model` the question went to.
 * @param sawImage - whether that route declares `image` input.
 * @mode emit
 */
'tool-image-inspect/delegated': (route: string, sawImage: boolean) => void
```

Source: [`packages/llm/tool-image-inspect/src/index.ts`](../../packages/llm/tool-image-inspect/src/index.ts)

<a id="tool-page-capture-events"></a>

### `tool-page-capture/*` events

<a id="tool-page-capturecaptured--emit"></a>

#### `tool-page-capture/captured` — emit

One capture published to the model.

Carries what the block beside the picture claims, so an invariant can check the claim against the reference without reaching into the store.

```ts cordis-catalog
/**
 * One capture published to the model.
 *
 * Carries what the block beside the picture claims, so an invariant can
 * check the claim against the reference without reaching into the store.
 * @param attachmentId - the stored image's identity.
 * @param width - encoded width in pixels.
 * @param height - encoded height in pixels.
 * @param bytes - encoded byte length.
 * @mode emit
 */
'tool-page-capture/captured': (attachmentId: string, width: number, height: number, bytes: number) => void
```

Source: [`packages/browser/tool-page-capture/src/index.ts`](../../packages/browser/tool-page-capture/src/index.ts)
<!-- END GENERATED cordis-surface -->
