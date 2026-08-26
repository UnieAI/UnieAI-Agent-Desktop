# @unieai/uad-tool-page-capture

[English](README.md) | 中文

`page_screenshot`：模型问一个网页长什么样，而一个只为这次调用存在的浏览器把它拍下来。

## 为什么不用操作员浏览器

`ctx.operatorBrowsers`（[`browser-operator`](../browser-operator/README.zh.md)）已经在驱动一个真的 Chrome，而这里刻意不用它。那一个是给**人**用的浏览器：钉在回环地址、绑定工作区，而且活得比显示它的面板更久——停在仪表板上的页面正是它的用途。这些都不属于一个面向模型的截图，其中还有一条在这里是有害的：长命的浏览器会把上一次调用的 cookie 带进下一次调用的画面里，一个站点的登录态就是这样被渲染进另一个站点的截图的。

所以这里用一次性 profile 启动浏览器、拍下一个页面、然后杀掉。两者共用启动与 CDP 的管道（`@unieai/uad-browser-operator/chromium`），别的什么都不共用。

## 为什么是工具而不是能力接缝

给页面拍照只有一种做法——驱动一个真浏览器——而消费者只有工具自己。只有一个 provider 和一个 consumer 的 Service Definition 是围着一个函数的排场。如果哪天出现第二种做法（比如远端渲染服务），那才是角色开始各自演化、值得画出接缝的时候。

## 拍到的是页面，而不是还没到齐的页面

这四个选项之所以存在，是因为一张图可以拍得完全正确，却回答了错误的问题。

**`waitForText`** 是其中最要紧的。等待计时器回答的是「时间够了吗」，从来不是「东西到了吗」；而一个持续开着流或轮询的页面根本不会进入 network-idle——所以没有标记时，截图就是在跟应用自己的数据赛跑。给了标记之后，工具会轮询已渲染的文本，若始终没有出现，就**以 `CONTENT_NOT_FOUND` 失败，而不是把骨架图交出去**。一张答错问题的骨架图，比没有答案更糟。

**`clipSelector`** 只拍一个元素、按它自己的尺寸，并且以页面坐标测量，因此滚动到视窗外的元素也拍得到。选择器匹配不到、或匹配到零尺寸的盒子，都是 `ELEMENT_NOT_FOUND`，而不是悄悄退回整页——扩大取景等于回答了另一个问题。

**`hideSelectors`** 把碰巧出现在画面上的东西藏起来。它设的是 `visibility` 而不是 `display`，所以移走一个通知不会让它底下的页面重排。

**`theme`** 模拟 `prefers-color-scheme`，并且在**导航之前**套用：在首次绘制之后才切换配色，拍到的是一个正在重绘的页面，而且有些页面只在启动时读一次这个偏好。

## 契约

- **只允许 `http` 和 `https`。** `file:` 会把一个工具参数变成宿主文件系统的阅读器，而浏览器特殊对待的那些 scheme 触及的是浏览器而不是页面。这里的调用方是**模型**，这使它成为两种情况里更需要这道围栏的那一种。
- 画面以**附件引用**离开，绝不内联字节：每次调用往 session log 里塞一兆字节的 base64，之后每一个重放它的回合都要付这个代价。
- `settleMs` 是拍照前的等待。load 事件不等于画完的页面——字体会替换、图片要解码、框架的首次渲染在那之后才落地——所以这个等待是部署的选择，用更慢的工具换不空白的截图。
- `fullPage` 由调用方指明，绝不猜测。手册通常要整页；「这看起来怎么样」通常只要首屏，两者互相都不是安全的默认值。
- 页面若用一个对象遮蔽了 `document.title`，标题会是空的，而不是 `[object Object]`。

## Model Experience

### System prompt

#### What the model sees

One section at order 112, fixed at registration; it does not interpolate per turn.

##### Screenshot guidance

```markdown
Use the page_screenshot tool to see what a web page looks like. It renders the address in a real browser and returns the picture, which is what to use when the ANSWER depends on layout, styling, or what is visible — a manual that needs an illustration, a check that a page renders. For the page's text or data, web_fetch is cheaper and more accurate.
```

#### Token effect

About 60 tokens of fixed guidance.

#### KV Cache effect

Fixed text in the stable prefix; it does not move across turns.

### Screenshot result

#### What the model sees

An envelope naming the address, the page's own title and the pixel size, followed by an image block carrying the attachment reference.

##### Screenshot envelope

```markdown
<url>https://example.org/</url>
<title>Example Domain</title>
<content>
PNG screenshot, 1280x800 px
</content>
```

#### Token effect

Three short lines, plus the image itself — whose cost is the model's own per-image accounting for a picture of the configured viewport, not anything this package meters.

#### KV Cache effect

Appended after the prompt, so earlier turns keep their prefix. The image rides as a reference, so replaying a turn does not re-send its bytes.

## 已知限制与暂缓事项

- 拍照前没有交互。它只导航然后拍照；需要点击、登录或关掉 cookie 横幅的页面，横幅会一起入镜。
- 除了宽高之外没有设备模拟——没有移动版 user agent、没有触控、device scale factor 也不超过 1。
- 等待是固定时长，不是就绪信号。慢页面拍到画到一半的画面，快页面则白等剩下的时间。
- 一次调用一个页面。跨多页的流程就是多次调用，而且它们之间不传递任何状态，这是刻意的。
