# Agent Note: 侧边栏会话行菜单中的 slot，以及它为何取 root scope

Status: implemented

[English](2026-08-23-sidebar-session-row-menu-slot.md) | 中文

## Problem

Session 日志导出原本位于对话头部（`conversation.session.header.utilities`），这把一个按 Session 生效的工具放在了唯一只能作用于「已打开的那个 Session」的位置。它更自然的归宿是侧边栏会话行的溢出菜单，与 Rename / Fork / Archive 并列——但那个菜单在 `ui-workspace` 的 `Rows.tsx` 中完全硬编码，没有任何扩展点，任何想在那里加一行的包都得反过来被浏览区 import。

该菜单对导出结果弹窗而言也是错误的生命周期。菜单行在菜单关闭的瞬间卸载，而 `/export` 从输入框执行时根本不涉及菜单，因此弹窗不能放在手势发起的位置。

## Decision

**一个由 WorkspaceBrowser 注册声明的 `list` slot：`sidebar.workspaces.session.menu.action`。** 它与该注册已有的子 slot `sidebar.workspaces.directoryFlow` 并列，因此其存在期恰好等于浏览区的挂载期。Rename、Fork、Archive 保持硬编码：三者各自驱动浏览器持有的对话框状态或区域状态，占用方无从提供；把它们搬进 slot，等于为零个消费者把三个私有回调导出成公共契约。

**session 由 owner share 携带，框架不得提供。** `SessionRowMenuActionOwnerProps` 是 `{ sessionId, closeMenu }`。slot 取 `root` scope，正是因为 `session` scope 会把框架的 `sessionId`——即**当前选中项**——交给每一个占用方。那样一来，除选中行之外的每一行都会静默地作用于错误的 Session：在别的行上打开菜单，导出的却是当前打开 Session 的日志。root scope 直接从 kit 中移除了该 prop，行的身份便只能来自 owner，`SessionNodeItem` 为每一行以该行的 `node.id` 派发一次 slot。`closeMenu` 之所以在 share 中，是因为菜单自身的 `onSelect` 派发看不到占用方的点击。

**`Menu` 新增 `extra` 并导出 `MenuItemButton`。** slot 占用方渲染的是 React 节点，而 `Menu` 按 id 派发 `MenuItem` 描述符——两者无法经由 `items` 相遇。`extra` 是渲染在 `items` 之后、滚动视口之内、`onSelect` 之外的 `ReactNode` 区域；`MenuItemButton` 就是 `Menu` 为自身条目绘制的那一行，导出它是为了让占用方与上方各行一致，而不必在自己的包里重述 36px 单元格度量和 `--dsw-alias-*` token。

**导出弹窗移至 `shell.overlay`。** `session-log-export` 现在有两处浏览器注册：菜单行进入新 slot，`SessionLogDownloadOverlay` 进入全框浮层，为每个存在打开中下载条目的 Session 渲染一个 `Modal`。该席位比两条入口路径都长寿，而原先的头部席位并非如此：在没有打开对话时执行 `/export` 根本没有弹窗。

## Consequences

对话头部不再承载导出入口；`conversation.session.header.utilities` 列表交还给 ui-conversation 自己的详情开关。`session-log-export` 把 `ui-conversation` 依赖换成了 `ui-layout` 和 `ui-workspace`（两处 SlotMap 合并的 type-only import），`HeaderAction.tsx` 及其样式表已删除。弹窗现在能报告应用内任何位置发起的下载，包括来自未打开 Session 的下载。

新 slot 的占用方随每次菜单打开而挂载、随每次关闭而卸载，JSDoc 中已写明：需要在手势之后存活的状态应放到 `shell.overlay`。该 slot 还是按每个可见行派发一次而非按每个菜单一次，因此即便没有菜单打开，占用方组件也会为每个列出的 Session 渲染——对一个按钮而言开销很小，这也正是占用方不得在组件体内做实际工作的原因。

`Menu` 自身的行现在也经由 `MenuItemButton` 渲染，因此子菜单与选中标记的标记结构只有一份定义。`MenuItemButtonProps` 的可选成员显式写出 `| undefined`，因为 client tsconfig 开启了 `exactOptionalPropertyTypes`。

## Testing

`ui-workspace` 在两个层面覆盖该 slot：`rows.client.spec.tsx` 断言占用方渲染为第四个 `menuitem`，并在当前选中项为另一个 Session 时仍收到本行的 Session，且 slot 为空时菜单保持三行；`workspace-browser.client.spec.tsx` 断言浏览区以行 Session（而非 `state.current`）派发 `sidebar.workspaces.session.menu.action`。`ui-primitives` 覆盖 `extra` 行渲染在 `items` 之后且不触达 `onSelect`。`session-log-export` 覆盖菜单行先关闭菜单再请求本行 Session 的下载、apply 注册进两个新 slot 且头部席位为空，以及浮层为任何界面都未显示的 Session 报告下载。

## Alternatives considered

- **在 `ui-sidebar` 中声明该 slot。** `…` 菜单并不属于侧边栏外壳：外壳只持有列的几何形态，并把整个浏览区交给 `sidebar.workspaces`。slot 必须由渲染它的那个注册声明，而那个注册是 ui-workspace 的 WorkspaceBrowser。
- **让该 slot 取 `session` scope。** 读起来顺，实则错得厉害：session kit 绑定的是当前选中项，因此非当前打开的行会导出错误的日志且不报任何错。root scope 让这个错误无法被表达。
- **把 Rename / Fork / Archive 也搬进该 slot。** 它们会要求把浏览区的重命名对话框状态、fork 回调和归档回声处理放进 owner share——一份只有一个占用方的公共契约，包规则以「没有第二个消费者的抽象」为由拒绝。
- **把弹窗留在菜单行自己的子树里。** 菜单关闭时会把它卸载，用户点击后将什么也看不到，`/export` 也会失去唯一的反馈界面。
- **把弹窗继续注册在对话头部。** 它只报告当前打开 Session 的下载，而这正是本次改动要消除的耦合。
- **让占用方自行渲染裸 `<button>`。** 那样它必须重述菜单单元格的度量与颜色 token，使同一行有两份会逐渐漂移的定义。
