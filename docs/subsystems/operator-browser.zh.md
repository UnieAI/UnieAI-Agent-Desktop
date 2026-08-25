# 操作员浏览器

[English](operator-browser.md) | 中文

给**人**用的浏览器，作为一个子系统：`ctx.operatorBrowsers`（[`browser-operator`](../../packages/browser/browser-operator/README.zh.md)）启动一个真正的 Chrome，通过 DevTools 协议连上它，并把页面的样子以 `operator-browser/*` 事件发布出去。它完全没有面向模型的那一侧——模型触达的 web 能力（[web.md](web.zh.md)）是另一个子系统，有自己的 provider，两者不共享任何词汇。

来源：[`packages/browser/browser-operator/src/types.ts`](../../packages/browser/browser-operator/src/types.ts)

## 两个方向，两种形状

人做的每一件事——打开、导航、点击、输入、调整大小、关闭——都是一次**调用**，并且拿到一个答复。**页面**做的每一件事则发生在页面自己想做的时候：一次加载完成、一段动画在跑、一个 `setInterval` 在重绘。所以重绘不经由调用返回；它们乘 cordis 事件（`operator-browser/frame`），经 Host 事件流抵达客户端。

这与[操作员终端](terminal.zh.md)在 `write` 和 shell 输出之间划的是同一条线，理由也一样：返回值只能描述调用者问过的东西，而 shell 和页面都不会把自己限制在那个范围内。

## 词汇

`OperatorBrowserId` 是服务铸造的品牌化 id，与系统中其他任何身份都相互独立。`OperatorBrowserView` 是客户端渲染的一个存活或已结束的浏览器——id、工作区、当前 `url` 与 `title`、最后上报的视口，以及 `live`。`OperatorBrowserOpenSpec` 是打开一个浏览器所需要的东西；`OperatorBrowserPointer` 与 `OperatorBrowserKey` 是两套手势词汇，按 DevTools 协议自己的叫法命名，这样没有任何东西需要被翻译两遍。

`OperatorBrowserError` 带一个码——`DISABLED`、`NO_BROWSER`、`NO_CHROME`、`TOO_MANY_BROWSERS`、`CLOSED`、`BLOCKED_URL`——好让面板能说出*为什么*，而不只是说失败了。逐字段的完整契约在[包 README](../../packages/browser/browser-operator/README.zh.md) 里；这一页记录的是这个子系统所处的位置。

## 围栏在哪里

`browser.*` 在 Host 上被**钉在回环地址**，与 `terminal.*` 并列。浏览器跑在 Host 所在的那台机器上，能触达那台机器能触达的一切，而它的帧就是这一切的照片——所以不被允许「打开」的调用方，同样不被允许「读取」，宿主事件流上的 `browser/*` 帧由回答调用时给出 403 的同一个检查过滤。做这个决定的是 carrier，因为 carrier 才是知道对端是谁的那一层。

浏览器自身身份的两半都刻意是全新的：一个一次性的 profile 目录，和一个属于它自己的浏览器进程，绝不是读者已经开着的那一个。[包 README](../../packages/browser/browser-operator/README.zh.md) 记录了原因。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
