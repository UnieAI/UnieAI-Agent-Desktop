# 模型视觉

[English](model-vision.md) | 中文

纯文本模型如何处理自己看不到的东西。两个面向模型的包落在这里——[`tool-page-capture`](../../packages/browser/tool-page-capture/README.zh.md)（`page_screenshot`，给网页拍一张图）和 [`tool-image-inspect`](../../packages/llm/tool-image-inspect/README.zh.md)（`image_inspect`，把一个问题交给视觉路由回答）。它们是各自独立的插件、各自独立的 seam；放在同一页，是因为它们是同一件事的两半：**取得**一张图，和**读懂**一张图。

两者都不属于 agent loop 主干，也都不是服务。它们都是消费方：`page_screenshot` 写入 [`ctx.attachments`](attachment.zh.md)，`image_inspect` 从中读取并调用 [`ctx.llm`](llm-streaming.zh.md)。在两者之间传递的图片是一个 `AttachmentId` 加上它的元数据——不是工具结果里的字节，也不是路径。

## `page_screenshot`——取得图片

每次调用启动一个浏览器，用完即弃：全新 profile、全新进程，在工具返回前就已拆除。没有任何会话存活到把一个页面的 cookie 带进下一个页面的画面里；这也正是它不等于换个名字的"人用浏览器"（[operator-browser.zh.md](operator-browser.zh.md)）的原因——那一个是长期存在、由人驱动，并且完全没有面向模型的一侧。

只有 `http` 和 `https` 地址可以拍摄。`file:`、`data:` 及其他所有 scheme 会在浏览器启动之前就以 `BLOCKED_URL` 被拒，因此这个工具无法被指向本地磁盘去读一个文件系统 seam 本会拦下的文件。

结果里带着存储引用，以及图片对自己的声明——宽、高、字节数；工具还会在图片块旁渲染一段文本信封，让没有图像输入能力的模型至少知道发生过一次截图、拍的是什么。

## `image_inspect`——读懂图片

本轮对话保持自己的模型。一个问题、一张图片、一次委派调用送往已配置的视觉路由；回答以文本回到发起的这一轮。会话的模型选择完全不变，并且路由名会随回答一起给出——关于一张图的回答，只能好到那个真正看了它的模型为止。

没有配置 `provider`/`model` 时，插件以**休眠**方式挂载，就像 `llm-pi-ai` 在没有任何 provider 时的挂载方式：没有视觉模型的部署干脆不提供 `image_inspect`，而不是提供一个每次都失败的工具。每次调用前它会重新确认该路由仍然声明支持 `image` 输入，因此当模型列表在运行期变化时，得到的是一次拒绝，而不是一个畸形请求。

当会话模型看不见时，**人贴上来**的图片走的是同一条路：宿主照常接纳并存储附件，然后把一段带着本工具所需 `image` 对象的占位文本交给模型，由模型自己就它提问。只有在根本没有注册 `image_inspect` 时才会拒绝该条消息——没有可委派的对象，接纳这张图片只会让它在组装请求时被悄悄丢掉。

图片大小不归本包管。适配器在读取附件时，已经按目标模型自己的 `imagePixelBudget`/`imageMaxBytes` 压过一次（[attachment.zh.md](attachment.zh.md)）；在这里再压一次，等于用两套预算把同一张图缩小两遍。

来源：[`packages/llm/tool-image-inspect/src/index.ts`](../../packages/llm/tool-image-inspect/src/index.ts)

两个包都注册工具，并各自发出一个观测事件；两者都不提供服务——下面的内容全部由那两处 `Events` 合并声明生成。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
