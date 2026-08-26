# @unieai/uad-tool-image-inspect

[English](README.md) | 中文

`image_inspect`：这一轮保留自己的模型，把**一个**关于**一张**图片的问题交给视觉路由。

## 是委派，不是换模型

回答关于图片的问题，最直觉的做法是把这一轮切换到视觉模型上。这里不这么做，理由有两个，而且都要过一阵子才显现。中途切换会丢掉前缀缓存，而且会让之后每一个纯文字步骤继续留在更贵的路由上——一份需要六张截图的手册，剩下的篇幅会全程待在那里。派 subagent 能避开这两点，代价是为一个问题跑一整个循环。

所以是一次工具调用带着图片和问题出去，回来的是文字。

**代价是真的，工具自己的描述里就写着：调用方拿到的是「描述」，不是图片。** 「这个按钮是蓝色的吗」经得起这样转述。「点那个按钮」经不起——答案里的坐标是在一张调用方看不到的图上量的，它没有办法核对。需要依据位置去行动的模型，应该自己在接受图片的路由上看那张图。

## 用户自己贴的图片如何抵达一个看不见的模型

人贴上来的图片不需要工具调用才能存在——它需要工具调用才能被**看见**。当会话模型没有声明图像输入时，宿主过去会拒绝整条消息（`MODEL_DOES_NOT_SUPPORT_IMAGES`，`packages/host/apiproxy/src/api-proxy.ts`）。在没有挂载任何能看图片的东西时，它仍然这么做。但只要本工具已注册，附件会照常被接纳并存储，模型收到的则是一段占位文本，里面带着本工具需要的那个 `image` 对象，一字不差。

接着由模型自己提问。这正是占位文本优于自动描述之处：在没人提问之前写下的描述，只是对「什么才重要」的一次猜测，而且不论答案是否需要，它都要为每一张贴上来的图片花掉一次视觉调用。提示词段落会告诉模型：占位文本是可查询的，并且在提问之前，「我看不到图片」不是一个可以给出的回答。

## 图片不在这里压缩

它以附件**引用**的形式传递。adapter 会通过 `attachments.readImageRequest`，依照模型自己声明的 `imagePixelBudget` 与 `imageMaxBytes` 派生出请求版本，按 variant 缓存，然后送出。在这里再压一次等于压两次、两边都没缓存到，而且会把本该属于部署所指定的那个模型的预算写死在这里。

## 没指定路由就休眠

config 里没有 `provider` 和 `model` 时，这个插件什么都不注册。没有视觉模型的部署因此不提供 `image_inspect`，而不是提供一个每次调用都失败的工具——跟 `llm-pi-ai` 在设置里没有 provider 时的姿态一致。

已指定的路由在每次调用前都会检查：没有声明 `image` 输入的路由在这里就被拒绝，给出的是关于组合的消息，而不是在 provider 内部给出一条关于请求格式错误的消息。

## 契约

- 一张图、一个问题、一个答案。空问题会被拒绝，而不是丢给视觉模型去猜。
- 空答案是失败，不是答案：把 `""` 当成有效值，它会原样落进调用方正在写的东西里。
- 给视觉路由的系统提示要求它只回答被问的事，图上没有就直说。视觉模型被问一个光秃秃的问题时，会自动补上一段关于画面其余部分的描述，而调用方——它从未看见那张图——分不出哪句是答案哪句是填充。
- 答案会指名它来自哪条路由，因为一个关于图片的答案，只能好到看它的那个模型那么好。

## Model Experience

### System prompt

#### What the model sees

One section at order 113, fixed at registration. Registered only when a vision route is configured; a dormant plugin contributes nothing at all.

##### Inspection guidance

```markdown
Use the image_inspect tool to ask about the contents of an image you cannot see yourself. Pass the image object exactly as the tool that produced it reported, plus one specific question. It answers from a vision model and returns text, so ask for the fact you need — the text on a button, whether an element rendered, what a chart shows — rather than for a general description.
```

#### Token effect

About 70 tokens of fixed guidance, and none when no vision route is configured.

#### KV Cache effect

Fixed text in the stable prefix; it does not move across turns.

### Inspection result

#### What the model sees

The vision route's answer, named with the route that produced it.

##### Answer envelope

```markdown
<model>unieai-cloud/gemini-2.5-pro</model>
<answer>
The primary button reads "Get started" and is blue.
</answer>
```

#### Token effect

Only the answer, capped by `maxTokens`. The image is spent on the OTHER route's request and never enters this turn.

#### KV Cache effect

Appended after the prompt. The delegated request goes out on a different route and does not disturb this turn's prefix.

## 已知限制与暂缓事项

- **调用方永远看不到那张图。** 每个答案都是某一个模型对它的解读，而错误的解读在下游跟正确的无从分辨。
- 一次调用一张图。比较两张图是两次调用，外加一个把两份答案当文字拿着的调用方。
- 路由由配置固定；工具无法按问题挑更便宜或更强的视觉模型。
- 与视觉路由之间没有对话：每次调用都是全新的单轮请求，所以追问一次就要重新送一次图。
