# @unieai/uad-upstream-names

[English](README.md) | 中文

本产品的包名与其所响应的上游 harness 包名之间的映射。两个纯函数，零依赖。

## 存在的理由

本仓库中的每个包都已从 `@deepseek-ai/dsh-*` 改名为 `@unieai/uad-*`（[映射](../../../docs/rescope.zh.md)）。社区插件生态并未随之改名，也不可能随之改名：已发布的插件以上游名称声明 peer 依赖和打包器 external，而这些 manifest 早已发布到 npm。这些插件没有任何一点与本 fork 不兼容，不同的只是它们所请求的名称拼写。

有两个面需要这份映射，且方向相反，因此它不属于其中任何一个：

- **主机端**会额外以上游名称发布每个已安装的包。[`healProfilesModuleFallback`](../../boot/app-boot/README.zh.md) 会按 `legacyNameFor` 为每个已安装的包写入一个转发包。
- **浏览器模块表**会用产品包来回答上游请求：当插件产物 require 的 specifier 在表中未命中时，`@unieai/uad-client-modules` 会先按 `productNameFor` 重试，然后才报错。

把同一条规则写两遍会让两者发生偏离，而这里的偏离会在运行时表现为无法解析的 import，而不是在构建时表现为类型错误。

## API

| 导出 | 含义 |
|---|---|
| `legacyNameFor(name)` | 产品包所响应的上游名称；其他 scope 返回 `undefined`。 |
| `productNameFor(name)` | 响应某个上游名称的产品包；其他 scope 返回 `undefined`。 |
| `UPSTREAM_SCOPE` / `UPSTREAM_PREFIX` | `@deepseek-ai` / `dsh`。 |
| `PRODUCT_SCOPE` / `PRODUCT_PREFIX` | `@unieai` / `rabi`。 |

两个函数互为精确的逆运算，并由一项往返测试断言。三条分支覆盖所有名称：无前缀的产品包（`@unieai/uad` ⟷ `@deepseek-ai/dsh`）、带前缀的 harness 包（`@unieai/uad-tools` ⟷ `@deepseek-ai/dsh-tools`），以及内置的框架包——它们不带前缀，只改变 scope（`@unieai/cordis` ⟷ `@deepseek-ai/cordis`）。

其他 scope 的名称在两个方向上都映射为 `undefined`。插件自身的依赖也会经过这两个函数，而改写其中任何一个，都会指向一个其作者从未发布过的包名。

## 模型体验

无：本包是用于模块解析的纯名称映射，此处没有任何内容会到达模型请求。

#### KV Cache 影响

无；此处没有任何内容会进入请求前缀。

## 已知限制与暂缓事项

- **该映射是结构性的，而非注册表**：它会改写任何匹配 scope 分支的名称，包括本仓库并未发布的名称。调用方应把映射结果视为「可以一试的候选」，而绝不视为该包存在的证明。
- **只支持一种上游词汇**：从其他上游改名而来的 fork 需要自己的 scope 常量；这些分支没有做成可参数化的形式，因为第二个上游目前没有任何消费方。
