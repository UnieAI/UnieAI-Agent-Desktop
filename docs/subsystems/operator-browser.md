# Operator Browser

English | [中文](operator-browser.zh.md)

The browser a **person** drives, as a subsystem: `ctx.operatorBrowsers` ([`browser-operator`](../../packages/browser/browser-operator/README.md)) launches a real Chrome, attaches to it over the DevTools Protocol, and publishes what the page looks like as `operator-browser/*` events. It has no model-facing side at all — the web capability the model reaches ([web.md](web.md)) is a different subsystem with different providers, and the two share no vocabulary.

Source: [`packages/browser/browser-operator/src/types.ts`](../../packages/browser/browser-operator/src/types.ts)

## Two directions, two shapes

Everything the person does — open, navigate, click, type, resize, close — is a **call** and gets an answer. Everything the **page** does happens whenever the page likes: a load finishes, an animation runs, a `setInterval` repaints. So repaints do not come back through the calls; they ride cordis events (`operator-browser/frame`) and reach a client through the Host event stream.

That is the same split the [operator terminal](terminal.md) draws between a `write` and the shell's output, and for the same reason: a return value can only describe what the caller asked about, and neither a shell nor a page confines itself to that.

## Vocabulary

`OperatorBrowserId` is a service-minted branded id, separate from every other identity in the system. `OperatorBrowserView` is one live or finished browser as a client renders it — id, workspace, current `url` and `title`, the last viewport reported, and `live`. `OperatorBrowserOpenSpec` is what opening one requires; `OperatorBrowserPointer` and `OperatorBrowserKey` are the two gesture vocabularies, named as the DevTools Protocol names them so nothing has to be translated twice.

`OperatorBrowserError` carries a code — `DISABLED`, `NO_BROWSER`, `NO_CHROME`, `TOO_MANY_BROWSERS`, `CLOSED`, `BLOCKED_URL` — so a panel can say *why* rather than only that something failed. The complete field-by-field contract lives in the [package README](../../packages/browser/browser-operator/README.md); this page records where the subsystem sits.

## Where the fence is

`browser.*` is **loopback-pinned** on the Host, alongside `terminal.*`. The browser runs on the machine the Host runs on, reaches whatever that machine can reach, and its frames are pictures of it — so a caller that may not OPEN one may not READ one either, and the `browser/*` frames on the host event stream are filtered by the same check that answers the calls with 403. The carrier makes that decision, because the carrier is the layer that knows who the peer is.

Both halves of the browser's own identity are deliberately fresh: a throwaway profile directory and a browser process of its own, never the one the reader already has open. The [package README](../../packages/browser/browser-operator/README.md) records why.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxoperatorbrowsers--operatorbrowserservice"></a>

### `ctx.operatorBrowsers` — `OperatorBrowserService`

Registry of the browsers a person opened in the GUI.

Browsers are scoped to a workspace, like terminals: a page left open on a dashboard must not close because the user started a new conversation.

```ts cordis-catalog
/**
 * Open a browser on one address.
 * @param spec - workspace, first address, and the panel's current viewport.
 * @returns the new browser's view.
 */
async open(spec: OperatorBrowserOpenSpec): Promise<OperatorBrowserView>

/**
 * Point this browser at another address.
 * @param browserId - the browser to navigate.
 * @param url - the address.
 */
async navigate(browserId: OperatorBrowserId, url: string): Promise<void>

/**
 * Forward a pointer gesture.
 * @param browserId - the browser to drive.
 * @param pointer - the gesture, in the page's own coordinates.
 */
async pointer(browserId: OperatorBrowserId, pointer: OperatorBrowserPointer): Promise<void>

/**
 * Forward a keyboard gesture.
 * @param browserId - the browser to drive.
 * @param key - the gesture.
 */
async key(browserId: OperatorBrowserId, key: OperatorBrowserKey): Promise<void>

/**
 * Tell the page its viewport changed.
 * @param browserId - the browser to resize.
 * @param width - viewport width the panel measures.
 * @param height - viewport height the panel measures.
 */
async resize(browserId: OperatorBrowserId, width: number, height: number): Promise<void>

/**
 * The most recent frame, so a reopened panel paints immediately.
 * @param browserId - the browser to read.
 * @returns the frame as base64, or undefined before the first paint.
 */
lastFrame(browserId: OperatorBrowserId): string | undefined

/**
 * Every browser this service holds, live and closed alike.
 *
 * Sent whole rather than as a delta so two panels watching the same Host
 * converge on the same list instead of each keeping its own running total.
 * @returns a view of every browser the service holds.
 */
list(): OperatorBrowserView[]

/**
 * The live browser for one workspace, if any.
 * @param workspaceId - the workspace to look in.
 * @returns its newest live browser's id, or undefined.
 */
liveIn(workspaceId: string): OperatorBrowserId | undefined

/**
 * End a browser and forget it.
 * @param browserId - the browser to close.
 */
async close(browserId: OperatorBrowserId): Promise<void>
```

Source: [`packages/browser/browser-operator/src/index.ts`](../../packages/browser/browser-operator/src/index.ts)

<a id="operator-browser-events"></a>

### `operator-browser/*` events

<a id="operator-browserchanged--emit"></a>

#### `operator-browser/changed` — emit

The set of operator browsers changed, or one of them navigated. Sent whole for the same reason the terminal list is: a second tab and a reconnecting browser have to converge on one authoritative value.

```ts cordis-catalog
/**
 * The set of operator browsers changed, or one of them navigated. Sent
 * whole for the same reason the terminal list is: a second tab and a
 * reconnecting browser have to converge on one authoritative value.
 * @param browsers - every browser the service still holds.
 * @mode emit
 */
'operator-browser/changed': (browsers: OperatorBrowserView[]) => void
```

Source: [`packages/browser/browser-operator/src/index.ts`](../../packages/browser/browser-operator/src/index.ts)

<a id="operator-browserframe--emit"></a>

#### `operator-browser/frame` — emit

One repaint of a browser's page, as a base64 JPEG.

```ts cordis-catalog
/**
 * One repaint of a browser's page, as a base64 JPEG.
 * @param browserId - the browser that painted it.
 * @param data - the frame, base64-encoded.
 * @mode emit
 */
'operator-browser/frame': (browserId: OperatorBrowserId, data: string) => void
```

Source: [`packages/browser/browser-operator/src/index.ts`](../../packages/browser/browser-operator/src/index.ts)
<!-- END GENERATED cordis-surface -->
