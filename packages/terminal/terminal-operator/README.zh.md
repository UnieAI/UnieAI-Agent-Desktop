# @unieai/uad-terminal-operator

[English](README.md) | 中文

给**人**用的终端。`OperatorTerminalService` 注册为 `ctx.operatorTerminals`，在 `ctx.subprocess.spawnTerminal` 之上打开交互式 shell 会话，以 cordis 事件推送输出，并把每个会话绑定到工作区而不是某一次对话。

## 为什么不复用面向模型的 PTY 栈

`ctx.terminals`（[`terminal`](../terminal/README.zh.md)）已经在跑 shell，这个包刻意不复用它。让它适合模型的三件事，恰好让它不适合人：

- 它把**每个操作都围在一个活着的 `Agent` 上**。人用的终端背后没有 agent，而且必须活得比打开它时那次会话更久。
- 它**靠轮询读取**（`TerminalReadRequest` 返回一个有界窗口）。终端模拟器需要输出在产生的当下就到达；正在打字的人感觉得到几十毫秒。
- 它的 bash 后端跑 **`--noprofile --norc`**，这是刻意的：模型必须在每台机器上遇到同一个 shell。人要的正相反——自己的提示符、别名、补全。

所以这个包在同一个 subprocess 原语之上自建注册表，与那一个毫无共享。在这里打开的终端模型看不见，模型打开的终端在这里也看不见。

## shell 不带任何旗标启动

`argv` 就是 `[shell]`。在 PTY 上，bash 及其同类仅凭终端本身就认定自己是交互式的，因而读取**交互式** rc 文件——`~/.bashrc`——oh-my-bash、starship、别名和提示符实际住在那里。加上 `-l` 会让它变成**登录** shell，转而读取 `~/.bash_profile` 或 `~/.profile`，除非其中某一个恰好 source 了 `~/.bashrc`，否则会跳过它；一个把全部配置放在 `.bashrc` 的用户，会在自己精心配置过的机器上拿到一个光秃秃的 `$` 提示符。Linux 的终端模拟器正是出于这个原因启动交互式非登录 shell。

程序依次取：绝对且可执行的 `$SHELL`、`/bin/bash`、`/bin/sh`。**相对**的 `$SHELL` 会被忽略而不是通过 `PATH` 解析：那次搜索跑在应用自己的 `PATH` 下，未必是当初找到用户登录 shell 的那一个，拿到一个同名的不同二进制比落到文档写明的后备更糟。`TERM` 设为 `xterm-256color`、`COLORTERM` 设为 `truecolor`，因为 shell 和它跑起来的每个全屏程序都读它们来决定可以发出哪些转义序列。

## 契约

- 终端**按工作区**划分。跑着 `npm run dev` 的 shell 不会因为用户开了新对话就死掉；它死于工作区的终端被关闭或进程退出。
- `open` 按工作区限制存活终端数（`maxTerminalsPerWorkspace`），shell 退出即释放名额。另一个工作区有自己的额度。
- 输出以 `operator-terminal/output` 发布，**同时**留在按字节有界的 `Scrollback` 里，因此重新打开的面板或重连的浏览器能够重绘，而不是面对一个矩形空白、背后 shell 其实还活着。裁剪按整块从头丢弃，重绘因此可能从一段转义序列的中间开始；终端模拟器自己的 scrollback 溢出时就是这么做的，渲染器会在下一段完整序列处重新同步。
- 尺寸是**夹紧而不是拒绝**。调用方是布局：隐藏的、正在挂载的、或拖动到一半的面板量出来是零或小数，而 PTY 两者都拒收。拒绝会把一次普通的渲染变成一次失败的按键。
- `signal` 打的是**前台进程组**，这正是 Ctrl-C 的含义。`SIGQUIT` 降级为 `SIGTERM`，因为 subprocess 接缝不允许 `SIGQUIT`，而一个人递不出去的信号比最接近的那个能用的更糟。
- `close` 只产生一次列表变化，而不是一次变化加一次退出：既然是客户端要求关的，就不为它宣告退出。
- 已退出的终端保留可读的 scrollback，并以 `EXITED` 拒绝输入。

## Model Experience

None, as the package registers no tool and contributes nothing to any prompt; a session opened here is invisible to the model, which reaches PTYs only through `tool-terminal` over `ctx.terminals`.

#### KV Cache effect

None; this package assembles and sends nothing.

## 已知限制与暂缓事项

- **这个分页会以启动应用的那个用户的身份执行任何命令。** 终端本来就是这个东西；`enabled: false` 让不想要这个界面的部署把它移除而不是藏起来。它不是沙箱，其中也没有任何东西是模型触达得到的——但它的权限恰好等同于键盘前的那个人。
- 不做会话持久化。终端不会跨应用重启存活，其 scrollback 只在内存里。
- `SIGQUIT` 实际以 `SIGTERM` 送出（见上）。会区分两者的程序看到的是错的那个。
- 输出按块以 UTF-8 解码。跨两次 PTY 读取被切开的多字节字符由流解码器重组，但 scrollback 的**驱逐**按块切，因此可能从重绘的开头丢掉半段转义序列。
