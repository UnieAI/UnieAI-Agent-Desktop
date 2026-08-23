# @unieai/uad-client-ui-sidebar

[English](README.md) | 中文

侧边栏外壳插件：负责品牌行、New chat 操作、其下的导航行 seat、布局持有的折叠控件、可感知滚动的区域 seat，以及收束整栏的身份行。[ui-workspace](../ui-workspace/README.zh.md) 持有渲染到 `sidebar.workspaces` 的 Workspace 与 Session 浏览器；本包既不派生其中的行，也不持有其视图偏好。折叠到布局拥有的 56px 轨道仍属于本地呈现行为。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)。

展开的品牌行把 `sidebar.brand.mark` 与 `sidebar.brand.name` 渲染为两个独立的 single slot，收起轨道则渲染同一个 mark slot。展开态的标记位于 28px 的细线身份底板中，按 16px 请求；轨道仍按 24px 请求。名称以 13/600 排在旁边，因此整个头部行就是一个处在 12/4 内边距中的 28px 控件。没有占位者时，外壳使用鱼形标记，以及带有构建期 7 位 `DSH_CLIENT_COMMIT_HASH` 徽标的 `UnieAI Agent` 标签。部署包可以单独替换任一值，而无须替换 New chat 控件或轨道几何；声明感知的 `slots.inject()` 让这种包无论先于还是后于侧边栏激活都能生效。

栏首有三行导航行，顺序与参考实现一致：**New chat**、**Search**，以及经由 `sidebar.nav.action` 的 **Plugins**。其中 Search 属于别人：搜索框、防抖与结果都归 [ui-workspace](../ui-workspace/README.zh.md) 所有，因此外壳只是**请求**而不是伸手去改。按下该行会抬升区域 owner share 上的 `searchRequest` nonce（收起状态下先展开栏），由区域自己决定「打开」意味着什么。用 nonce 而非布尔值，是因为按两次就是两次请求，布尔值会吞掉第二次。

New chat 会启动运行时的页面局部前端 Session Intent。运行时优先使用作用域操作明确指定的 Workspace，否则使用当前 Session 所属 Workspace，再否则使用最近活跃 Workspace；一个 Workspace 都没有时则清空选择，进入空白 New chat 页面。Workspace 专属控件与共享选择器由 ui-workspace 持有。

栏内所有行共用同一个盒子：8px 的行内内边距，随后是参考栏自身的行 —— 13/19.5 文字外包 `7px 10px` 内边距、`--dsw-radius-control` 圆角，因此在 264px 栏宽内一行量得 248x33.5 —— 次级墨色在悬停时经 150ms 颜色过渡升至主级。行本身保留继承字重，500 只由标签承担。New chat、其下的 `sidebar.nav.action` 行与 Workspace 浏览器的行都采用它，因此整栏读起来是一份列表，而不是若干堆叠的组件。

`SidebarRootComponentProps` 组合布局 owner share、全局 `useSessions` 和 `useWorkspaces` 钩子、已声明的品牌、`sidebar.nav.action`、`sidebar.workspaces`、`sidebar.settings` 与 `sidebar.account` 子 slot，以及注入的 `startSession` 与侧边栏切换回调。这里没有插件 store。

实时收起时，外壳会把展开内容固定在当前宽度，并用 150ms 将其淡出。随后，上方各控件——外壳的侧栏切换与 New chat、导航行，以及通过 `sidebar.workspaces` 渲染的添加和搜索——共用一次 150ms 的淡入和 49px 左移，在布局的 300ms 栏滑动结束时一起进入 56px 轨道；每个 36px 控件盒都会沿同一条路径到达轨道左侧 10px 的内边距。固定在底部的身份行只共用淡入时序，不发生横向位移。页面初始即为收起状态时会静态渲染轨道；减少动态效果模式会禁用两段过渡。

栏内的滚动条是一种指针可供性：只要指针不在栏内，外壳就把 ui-theme 的[滚动条间接层](../ui-theme/README.zh.md)重新绑定为 `transparent`；指针离开后滑块再保留 2 秒，因此没人指向的列表不会带着滚动条。避免行位移的空间预留属于滚动区域本身（[ui-workspace](../ui-workspace/README.zh.md)），所以显示滑块不会引起重排。

`sidebar.nav.action` 是 New chat 之下那一组有序导航行，与参考栏的开头一致。占位者只收到栏状态（`wide`），并绘制外壳自身的行盒——也就是其上方 New chat 所绘制的那一个；ui-settings-general 在此注册「外挂程式」行。展开时该 seat 让它们按整行宽度堆叠，轨道上则居中每个 36px 控件。

页脚是同一条带内的两个 seat：`sidebar.footer.action` 列表，以及其下由 `sidebar.account` 与 `sidebar.settings` 共用的**一行**身份行。该行是单一的 248x40 盒子，圆角取 `--dsw-radius-control`，内边距 `6px 8px`、间距 10px，与 UnieAI 网页版收束自身侧边栏所用的那一行一致；因为由两个包共同填充，盒子由 seat 持有，各占位者只带来自身内容与自身的交互装饰：ui-unieai-account 提供 28px 身份标记与占据余量的 13/500 名称，ui-settings-general 提供固定在右端的 15px 设置图标。该条带带有 8px 纵向内边距、一条 `--dsw-alias-border-l2` 顶部细线，以及 2px 侧向内边距以抵消该行使用的 `-2px` 横向溢出，使其盒子与 New chat 和会话行落在同样的左右边界上。页脚操作按整行宽度堆叠在其上方。轨道则去掉细线与侧向内边距，把身份行转为纵向（标记在上、图标在下，相距 4px），并居中每个 36px 控件。

`/client` 导出表层只包含插件主体（`apply`／`inject`）及约定类型；SidebarRoot、行组件和树派生仍由 slot 注册封装在包内。

## 模型体验

无。侧边栏渲染浏览器会话列表；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包（package）既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **Session 状态点渲染由 [ui-workspace](../ui-workspace/README.zh.md) 持有**：没有可用的 done/error 通知数据源。
- **Workspace 浏览行为由组合持有**：分组、排序、搜索与行状态都属于 [ui-workspace](../ui-workspace/README.zh.md)，不属于此外壳。
- **「New task completed」未读标记是本地查看状态**：完成时间 > 上次查看时间这一事实永远不会到达宿主。
- **身份底板的圆角写成字面量 6px**：参考栏把头部装饰的圆角设在行圆角之下一级，而 `--dsw-*` 并未声明该级别的 token。此事已上报给主题持有方，而不是在这里新增。
- **56px 轨道属于本应用自身**：参考栏没有轨道状态，因此它的几何（36px 圆形、12px 节奏）不来自任何参考实现，保持原样。
