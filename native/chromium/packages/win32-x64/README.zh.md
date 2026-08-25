# @unieai/rabi-chromium-win32-x64

[English](README.md) | 中文

给 **x86-64 的 Windows（arm64 上以模拟方式执行同一份）** 用的开源 Chromium 建置，随包带着，好让一台自己没有浏览器的机器也能用操作员浏览器。

Chromium snapshot revision：`1685180`——BSD-3-Clause，载荷旁边那份 LICENSE 就是它发布所依据的条文。

## 刻意用 Chromium，而不是 Chrome for Testing

Chrome for Testing 是最顺手会去下载的那个，也是最不该转散布的那个：它是 **Google 品牌**的建置，带着专有的 Widevine CDM，依据的是 Chrome 的服务条款而不是开源授权。`scripts/verify-payload.mjs` 会在发布前逐平台断言这两样都不存在，而不是相信版本钉里那个 URL 还指着原来的地方。

代价是 Chromium 的 snapshot 压缩档是一个建置**输出**目录，不是整理过的发行版，所以里面带着浏览器用不到的产物——光 `interactive_ui_tests.exe` 就有 342MB。`scripts/fetch-chromium.mjs` 会在解开时把它们丢掉。

## 没有任何东西 import 它

`@unieai/uad-browser-operator` 从这个包里解析出 `chromium.json`，再启动它指名的那个可执行文件。这里没有 JavaScript 可以载入——载荷是一个浏览器，旁边那份 manifest 说明可执行文件在 `browser/` 里的哪个位置。

npm 只会装这四个当中的一个：`os` 和 `cpu` 字段就是让另外三个在你的机器上被跳过的原因，也是让不在清单上的平台一个都不装、而不是安装失败的原因。

## 四个 revision 为什么不一样

Chromium 按平台在各自建置完成的那些 commit position 上传 snapshot，所以四个平台都有的同一个 position 很罕见——这里的 revision 相差大约六十个 commit。硬要钉一个共用的号码，等于钉一个旧的，或者干脆钉不到。回报 bug 需要的是下一个人拿得到的那个 build，而按平台钉的 revision 精确地指名了它。
