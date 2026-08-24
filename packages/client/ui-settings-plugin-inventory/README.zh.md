# @unieai/uad-client-ui-settings-plugin-inventory

[English](README.md) | 中文

[插件页面](../ui-plugins-page/README.zh.md)上的只读**插件目录**：Cordis Loader 为本次构建报告的全部插件，分组、可搜索，并且不画任何它无法兑现的控件。它注册一个本地化的 `plugins.page.area` 贡献，id 为 `plugin-directory`，order 为 5 —— 位于账号的 Studio MCP 服务器与 cordis 配置注册表之间。插件激活期间不读取 Remote；只有页面挂载该区块时，才通过 [`api-remotes`](../../api/remotes/README.zh.md) 懒调用一次 `ctx.remote.pluginInventory.list()`。

## 为什么放在页面而不是设置面板

它原本是 `ui-settings-plugins` 的「插件」设置分区里的 `all` 标签页，而那个分区现在已经是独立插件页面上的一个区块。由此有两点。已经不存在 `plugins` 设置分区，而 [`ui-settings-general`](../ui-settings-general/README.zh.md) 恰恰在没有该分区时才隐藏它自己的「插件」导航行 —— 把目录放回面板会让「插件」重新有两个去处，而这正是那个页面要终结的事。另外，目录本身就是那个页面：塞进一个面向开发者的配置分区的标签页里，它就成了子分区的子分区，标题、标签栏与外框全归另一个包所有。所以它占据页面自己的区块座位，那正是页面为此声明的座位。

## 它画什么

一个标题、一段引言、一个搜索框，然后是分组：组标题带计数，两者下方一条发丝线，线下是可回流的行网格。行不是卡片 —— 没有边框、没有填充、没有圆角。它是插件的短名称，下面一行是代码字体的完整模块说明符，单行截断；根 Fiber 的阶段以一个小圆点画在参考页面放置操作控件的位置上。

搜索同时匹配模块说明符与 Loader 条目 id，且不区分大小写。某一组的行被全部过滤掉时，该组整个消失，而不是留下一个空标题和一条线。

## 选定的分组，以及被否掉的分组

**已启用与已停用，因为 `enabled` 是这条线路唯一陈述的划分。** `pluginInventory.list()` 每行报告四个字段 —— Loader 条目 id、模块说明符、有效启停状态（含被停用的祖先组）、根 Fiber 的阶段。有效启停状态是每一行都有的布尔值，是 profile 作者刻意设定的事实，而且在出厂的 web profile 里这是一次真实的划分而非形式：`dsh-web-app` 停用了约二十多条 `dsh-base` 行，它们的 host 平面职责已经移到 agent preset 后面。

三种分组被考虑过并否掉：

- **按 bundle** —— `@unieai/uad-base`、`@unieai/uad-web-app`、装进 profile 的第三方 bundle。这才是参考目录里来源筛选的真正对应物，也是最值得有的那个，但线路上没有它，也无法从现有字段推导出来。`app-boot` 把每个 `dsh.profile.bundles` 条目解析到它的 `cordis.patch.yml`，再把这些 patch 列表**在内存里**叠加到一个空根之上；合成出来的 `EntryOptions` 不保留是哪一层插入了它，而 profile 磁盘上的 `cordis.yml` 就是那个空根。要报告它需要付出什么，见*已知限制*。
- **按平面** —— host 与浏览器。出厂 profile 里每一条浏览器行恰好都叫 `@unieai/uad-client-*`，但 `@unieai/uad-api-remotes` 也是浏览器行，`dsh-client-modules` 两边都是。那是一条有例外的命名约定，不是数据；把切分打扮成分类法，读者会当成事实。
- **按 Fiber 阶段** —— 五个桶，其中四个通常是空的，而每一行本来就用圆点带着自己的阶段。

这里刻意没有任何编辑性分组。参考里的 `Featured` 与 `Coding` 来自一份有编辑层的策展目录；本部署两者都没有，凭空造一个就是把分类法写进一份并不携带它的快照。

## 不安装、不开关、不移除

参考目录的行末尾是 `+` 或 `✓`。这里一个都不画，也不能画：`pluginInventory.list()` 是本部署唯一存在的插件 RPC。安装是 `rabi plugin --profile web add <spec>`，一个在 profile 目录里转发给 `pnpm` 并随后调和 `dsh.profile.bundles` 的 CLI 命令；启停是某个 patch 层里的一行 `disabled:`。在浏览器里为两者中的任何一个放按钮，按下去每次都会失败。区块画的是另一样东西：一句话说明每个动作真正在哪里发生 —— 与它上方的 Studio MCP 区块出于同样理由所做的事相同。

尾列画的是状态圆点而不是图标，正是为了让行上没有任何东西看起来可按。共享的 `StateDot` 原子没有被使用：它带四种语义，而 Loader 报告六种阶段，会有两种不得不借用它们并不具备的含义。

## 文案

`title`、`search`、`enabledTag` 与 `disabledTag` 逐字取自 UnieAI Copilot 网页版的 `messages/{en,zh-cn,zh-tw,ja}.json`，来源命名空间与 key 标注在 [`src/client/locales.ts`](src/client/locales.ts) 的每一行旁边。四个出厂语言各自携带完整词典。三处偏离记录在该文件头部：zh-CN 的启用/停用一对保留本包自己的用词，因为参考的 zh-cn 值是用繁体字写的；六个 Cordis 生命周期标签在参考里没有对应物，四个语言都是本包自己的用词；`intro` 与 `note` 是本包自己的用词，`note` 之所以存在，是因为指出真正能用的命令，才是无法生效的控件的诚实替代。

## 样式

只用 CSS Modules 与语义化 `--dsw-alias-*` token —— 没有字面色值、没有回退值、没有品牌色 —— 遵循 [`AccountSection`](../ui-unieai-account/src/client/AccountSection.module.css) 声明的语言：14/22 正文、12/18 小字、`border-l2` 发丝线、8px 控件圆角。任何地方都不用 `bg-layer-*` 填充：浅色调色板里 layer 1–3 解析成同一个白色，用它涂的表面在深色下存在、在浅色下消失。目录根本不需要填充 —— 唯一带边框的元素是搜索框，而那是共享的 `Input` 原子，不是本地重写一遍的输入框。

行网格是 `repeat(auto-fill, minmax(min(288px, 100%), 1fr))`，与其上方 Studio MCP 工具网格的构造相同。`min(…, 100%)` 这个下限是承重的而非装饰：页面横跨整个框架宽度，一旦框架窄于一条轨道，裸的 `288px` 下限就会溢出容器，在 390px 下整页会横向滚动。

## 模型体验

无，因为本包只在浏览器里展示 Host 拥有的部署快照，不注册任何模型接口。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **每次打开页面或重试只读取一份快照。** 区块不订阅 Loader 变化，重连后也不会自动重读；离开插件页面再回来会取得新的一份。Loader 会发出 `loader/config-update` 与 `loader/entry-init`，Cordis 也会发出 Fiber 状态变化，订阅是有东西可依托的；缺的是 `pluginInventory` 的推送流，而加一条是 host 侧的改动。
- **来源无法从这一侧报告，按 bundle 分组需要 host 改动。** 层的身份在合成时是存在的 —— [`app-boot`](../../boot/app-boot/README.zh.md) 的 `loadProfile` 为每个 bundle 返回一个 `ProfileLayer`，带着它的 `packageName` 与解析后的 patch 列表 —— 却在任何 Loader 条目出现之前就被丢弃了。要报告它，要么在合成时给每一条被插入的行盖上它的来源层，要么把已加载的 profile 交给 `PluginInventoryGateway`，由它把每个 id 归因到最后一个在 `insert` 列表里点名过它的层。两者都要动 [`plugin-inventory`](../../host/plugin-inventory/README.zh.md) 与 `app-boot`，而第二种的准确度取决于 id：没有写明 `id` 的 patch 行会拿到生成的 id，只能按位置归因。
- **安装需要一个并不存在的 RPC。** `rabi plugin` 在 profile 目录里以同步子进程方式启动 `pnpm`，并改写 `package.json`。浏览器里的控件需要一个新的 Host Remote —— 长时间运行、把进度推流出来，并持有写 profile 与执行包管理器的权限，而现有任何 Remote 都不持有这种权限。它先是一个信任边界的决定，然后才是 UI 的决定。
- **启用、停用与移除需要一条可写的 Loader 路径。** Loader 可以在线切换条目（`entry.update({disabled})`），所以运行时那一半是有的；缺的是够到它的 Remote、变更该持久化到哪里的规则 —— 在浏览器里停用的行必须能扛过重启，也就是要写 profile 的 `cordis.patch.yml` 而不是合成出来的树 —— 以及对那些不能允许用户停用的行（例如承载这次请求的传输层）该怎么办的答案。
- **Loader 条目 id 可搜索但不绘制。** 它以 `data-plugin-entry` 留在行上，并且仍是搜索目标。不绘制是因为除了极少数行以外它都在重复标题，而在它不重复的地方 —— 一条没写明 id 的 patch 插入行 —— 它是一串什么都不指的生成十六进制。需要它的读者是在编辑 `cordis.patch.yml` 的人，那位读者手上就开着那个文件。
- **没有筛选行。** 参考里的胶囊按来源筛选，而本部署没有来源（见上）。剩下的那一个维度做成胶囊行，只会把紧贴其下的组标题重说一遍，而只有一个取值的筛选器是一个无事可做的控件。
- **没有 hero 横幅。** 参考里的那个是策展目录中推广插件的轮播。这里没有可推广的东西，用任意一行去填那块空间，就是本包无法支撑的编辑性主张。
