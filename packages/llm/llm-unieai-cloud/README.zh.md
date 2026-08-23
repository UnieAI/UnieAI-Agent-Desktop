# @deepseek-ai/dsh-llm-unieai-cloud

[English](README.md) | 中文

把已登录 UnieAI 账号有权使用的模型注册成一条可真正运行的 `llm` 路由，由网页产品的计量推理中继承载。

```yaml
- id: llm-unieai-cloud
  name: '@deepseek-ai/dsh-llm-unieai-cloud'
```

## 为什么是中继，而不是供应商 key

产品知道一个账号可以运行哪些模型，并刻意拒绝把运行所需的凭证发给桌面端：放在笔记本上的 key 会花掉账号的供应商额度，而产品那边没有任何东西能把它计进去。`lib/desktop/models.ts` 与 `lib/desktop/providers.ts` 都在类型层面剔除了 `apiKey`，因此桌面端没有任何投影能从中读出一个凭证。

产品公布的是另一样东西：`POST {product}/api/desktop/v1/chat/completions`——OpenAI 兼容、由桌面 API key 认证、在服务端解析上游、执行方案配额、计量该回合并流式回传。本包就是这套安排的桌面半边：一条路由，指向该端点，其模型是账号的权限清单，其凭证是闸门会话的 API key。

适配器本身是 `@deepseek-ai/dsh-llm-pi-ai` 的 `PiAiAdapter`，用该包的 `resolveProfiles`、`credentialStoreFrom` 与 `authContextFrom` 构建。只有设置文档通常会提供的那两样——目录与凭证——改由登录闸门回答，因为这两者都是关于「谁登录了」的事实，而不是关于部署的事实。

## 登出时，这条路由什么都不提供

只要 `ctx.unieaiGate` 没有会话，`credentialReady` 就回答一个确定的 `false`。那正是 `buildModelCatalog` 据以整条丢弃路由的缝，而且只有确定的 `false` 才会丢弃——`undefined` 与抛错都会保留模型——所以把它答准，正是让登出状态的桌面端不显示任何云端模型、而不是列出一串一选就失败的名字的关键。

在第一次成功读取之前，这条路由根本不会注册，因为没有模型的 pi-ai 路由无法解析。一旦注册，它就在插件生命周期内一直注册着，包括登出之后：撤销它会让适配器回答「不是我的」——一个未知——而未知刻意不足以隐藏任何东西。

若某个回合仍然抵达了一条已登出的路由，它会以 `MISSING_CREDENTIAL` 失败并指向 `/auth/login`，而不是无凭证地发出去、让中继回一个 401 而被 agent 循环读成供应商故障。

## 目录

`ctx.unieaiGate.entitledModels()` 就是 `/auth/models` 所服务的那份清单：产品自己的选择器所构建的并集——账号选中的个人供应商模型、其群组授予的模型，以及全局模型。每一条成为该路由上的一个模型：

- 模型 **id** 是权限值（`${prefix}-${modelId}`），因为中继据此解析上游，账号也据此计费；
- **名称**是裸模型标签，那才是人在列表里认得出的东西；
- **图像输入**只在产品判定该模型接受图像时才声明。过度声明会让图片先被附加、再在回合中途被拒绝，而那时消息已经落盘。

容量是两边都不知道的那一样：产品不回报容量，而中继是账号所有权限上游之上的一层门面，没有可以询问的对象。`defaultContextWindow` 与 `defaultMaxTokens` 是部署给出的答案。

每次会话变化以及每隔 `catalogRefreshMs` 都会重读清单，因为权限会在产品那边变化——从本桌面端的「账户」分区添加一个 API Provider 就会改变它——而没有任何信号告知何时。读取失败会保留先前的目录；产品回报为「无任何权限」的账号也一样，因为空路由根本无法解析。

## 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `provider` | `unieai` | 本插件拥有的 `llm` 路由键。之所以可配置，仅因为路由键在各适配器家族之间是全局的。 |
| `displayName` | `UnieAI` | 模型选择器为该路由显示的名称。 |
| `defaultContextWindow` | 131072 | 为每个权限模型假定的上下文容量；本质上是猜测。 |
| `defaultMaxTokens` | 16384 | 为每个权限模型假定的输出能力；同上。 |
| `catalogRefreshMs` | 15 分钟 | 登录期间重读权限清单的间隔。这不是凭证刷新——会话的 API key 与会话同寿。 |

## 消费的服务

| 服务 | 用途 |
|---|---|
| `ctx.llm` | 注册该路由并服务其请求。 |
| `ctx.unieaiGate` | 读取已登录账号、其 API key 与其权限模型。 |
| `ctx.attachments` | 可选：经 pi-ai 适配器为请求解析持久化的图像字节。 |
| `ctx.credentials` | 可选：为 pi-ai 的凭证存储与环境查找兜底；本路由不往其中存放任何东西。 |

## Model Experience

Indirectly, through the `dsh-llm-pi-ai` adapter it registers, which owns the assembled provider request and every model-visible field in it.

#### KV Cache effect

前缀稳定：该路由自身不添加任何提示内容，目录刷新改变的是提供哪些模型，而不是任何一次请求的内容。在该路由上选中一个模型会把回合发往账号的中继，中继再转给账号有权使用的上游——因此提示缓存的复用属于那个上游，而在解析到不同上游的权限值之间切换会开启新的前缀。

## Known Limitations and Deferred Work

- **容量靠配置，而非探测。** 产品不回报上下文窗口或输出上限，中继也无法就此被询问，因此每个权限模型都由同两个配置值定尺寸。小于 `defaultContextWindow` 的模型会被塞过头，而失败要到回合中途才从上游传回。
- **中继的拒绝码没有被翻译。** `model_required`、`no_provider_for_model`（402）、`quota_exceeded`（429）与 `upstream_unreachable`（502）都以普通的供应商 HTTP 失败抵达 agent 循环。因此配额耗尽的账号会被当成供应商故障来报告，重置时间只留在响应正文里；把它们映射到本 harness 自己的错误词汇，需要一道 `dsh-llm` 目前没有的缝。
- **需要特定 harness 的模型被当作普通聊天模型提供。** 产品会把部分权限模型标记为 `agentHarness: studio_opencode`，意指其网页 agent 会以特定方式运行它们。这里原样提供，因为中继对每个权限值都提供普通 completions；它们在本桌面端自己的循环下表现如何，两边都不回报。
- **登出后的路由仍在内存中保留最后一份目录。** 从中不提供任何东西，它也不持有凭证，但上一个登录账号的模型名会存活到插件被重载为止。
- **目录靠轮询。** 权限变化时产品没有信号，因此在别处新增的模型最多晚 `catalogRefreshMs` 才在这里出现。
- **没有按路由的重试策略。** 该路由沿用 `dsh-llm` 的常规默认值。正在对账号限流的中继，会与一台短暂不可达的供应商被同等重试，而这对一个计量端点未必正确。
