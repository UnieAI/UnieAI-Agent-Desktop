# @unieai/uad-browser-operator

[English](README.md) | 中文

给**人**用的浏览器。`OperatorBrowserService` 注册为 `ctx.operatorBrowsers`，启动一个真正的 Chrome，通过 DevTools 协议连上它的页面，并把页面的每次重绘以 cordis 事件推送出去。和旁边的[操作员终端](../../terminal/terminal-operator/README.zh.md)一样，它绑定到工作区而不是某一次对话，模型看不见也碰不到这里的任何东西。

## 为什么不用 iframe

面板原则上可以直接嵌入页面，完全跳过这个包。实际上不行：每一个值得这样打开的站点——仪表板、控制台、读者已经登录的后台——都正是为了阻止文档嵌入它而设置了 `X-Frame-Options` 或 `frame-ancestors` CSP，而浏览器在我们的任何代码运行之前就会执行这条规则。Chrome 拒绝嵌入的东西，它很乐意*截屏推流*，所以画面以 JPEG 帧经 CDP 回来，手势则往反方向去。

这个反转也决定了几何。Host 拿到的是面板自己的像素尺寸，画面按 1:1 绘制，于是屏幕上 `(x, y)` 处的点击就是页面里 `(x, y)` 处的点击。缩放过的画面需要把每个手势一起缩放，而且在一次 resize 与回应它的那次重绘之间的那一帧上必定是错的。

## 为什么开自己的 Chrome，而不是接管已经在跑的那个

`open` 会以 `--remote-debugging-port=0` 和一个临时目录下的一次性 `--user-data-dir` 启动全新的 Chrome。接管读者正在使用的浏览器是另一个选项，而且在每个方向上都更糟：`Page.bringToFront` 和 `Page.navigate` 会在他们脚下挪动窗口和标签页，截屏推流会把他们开着的其他东西一并广播出去，而关闭面板还得决定自己有权结束他们的哪些标签页。独立的 profile 也意味着操作员浏览器是登出状态启动的——这对它的身份是诚实的，而不是悄悄继承一个没人打算出借的登录态。

## 它自己带的浏览器

安装时就把 Chrome 一起带进来。`@unieai/uad-browser-operator` 把四个载荷包——`@unieai/rabi-chromium-{darwin-arm64,darwin-x64,linux-x64,win32-x64}`——声明为 `optionalDependencies`，它们的 `os`／`cpu` 字段使 npm 只装这台机器跑得动的那一个，其余三个跳过。不在清单上的平台一个都不装，而且照样装得成功。

载荷是 Chromium 项目自己的 snapshot 建置，BSD-3-Clause——刻意不用 Chrome for Testing，那是 Google 品牌的建置，带着专有的 Widevine CDM、依据 Chrome 的服务条款，不是我们能转散布的。带着而不是现抓，是为了让回报可以重现：revision 钉死在 `native/chromium/chromium-version.json`，别人回报的 bug 指名的那个 build 下一个人拿得到。这也正是为什么调用过程中什么都不抓——在有人正要开标签页时才去下载浏览器的包，会在计量网络上下到一半失败。

查找顺序：`RABI_CHROME` 第一且无条件，接着是自带的载荷，然后是平台的常见安装路径，最后是 Playwright 的浏览器缓存（新的优先）。自带的 build 排在机器自己的 Chrome 之前，理由就是上面的可重现性；`RABI_CHROME` 排在所有东西之前，因为会去指名浏览器的操作者有他的理由。

## 契约

- 浏览器**绑定工作区**，`open` 对每个工作区的存活浏览器数设上限（`maxBrowsersPerWorkspace`）。关闭一个就释放一个名额。
- **只允许 `http` 和 `https`。** `file:` 会把地址栏变成宿主文件系统的阅读器，而浏览器特殊对待的那些 scheme 触及的是浏览器本身而不是页面。拒绝时给出 `BLOCKED_URL`。
- 重绘以 `operator-browser/frame` 发布，并**保留最后一帧**，这样重新打开的面板或重连的浏览器画出的是页面此刻的样子，而不是一个空矩形。每个浏览器只留一帧，替换而不是累积——截屏推流不是回滚缓冲。
- 尺寸**只夹取、不拒绝**，理由与操作员终端相同：隐藏中、挂载中或拖拽中的面板量到的是零或一个分数，拒绝会把一次普通渲染变成一次失败的手势。
- `Page.bringToFront` 在 `Page.startScreencast` **之前**发送。无头 Chrome 没有窗口管理器，少了这一步截屏推流会回 `Not attached to an active page`——页面是真的，只是没有谁告诉过 Chrome 它是可见的那一个。
- `close` 结束进程、关闭 CDP 连接、删除 profile 目录。删除会重试：父进程退出时 Chrome 的辅助进程仍在写入，第一次 `rm` 会以 `ENOTEMPTY` 输掉这场竞争。
- 拆卸经由 `ctx.effect` 注册，因此卸载插件会结束它启动过的每个浏览器。泄漏的 Chrome 不是泄漏的文件句柄——它是一个看得见的进程，占着谁也够不到的 profile。

## Model Experience

None, as the package registers no tool and contributes nothing to any prompt; the browser opened here is invisible to the model, which reaches the web only through `tool-web` over `ctx.web`.

#### KV Cache effect

None; this package assembles and sends nothing.

## 已知限制与暂缓事项

- **浏览器触达 Host 机器触达得到的一切**，包括 `localhost` 和它所在网络上的任何东西。这正是面板有用的原因，也正是 `browser.*` 被钉在回环地址的原因；`enabled: false` 让不想要这个界面的部署把它移除。它不是沙箱。
- 没有历史。没有后退也没有前进，因为服务没有暴露这两者——一个按下去不做事的控件比没有这个控件更糟。导航靠地址栏和点击链接。
- 没有下载、没有文件选择器、没有打印、没有开发者工具。页面交给 Chrome 的文件落在一个一次性 profile 目录里，别的东西读不到。
- 帧是 JPEG，所以满是小字的页面会比真实窗口里的同一页更糊。`frameQuality` 用画质换推流跟得上的速度。
- Chrome 以无头模式运行，少数站点在那里的行为不同。这里不检测也不绕开这一点。
- 一个浏览器就是一个页面。站点用 `target=_blank` 打开的标签页不会连上任何地方，也不会被显示。
- 不在那四个平台清单上的机器（Linux arm64、32 位 Windows 等）不带浏览器，退回查找机器自己的 Chrome；一个都找不到时拿到 `NO_CHROME`，消息里点名 `RABI_CHROME`。
