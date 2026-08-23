# @deepseek-ai/dsh-client-ui-brand-unieai

[English](README.md) | 中文

本包以 UnieAI 的标记与名称填充 `sidebar.brand.mark`、`sidebar.brand.name` 与 `conversation.hero.brand.mark`。它无条件注册：上游的官方品牌包会在非 `official` 构建配置下自行停用，而 UnieAI 组合改为移除该包的名册行，不与它争夺同一批槽位。

三个占位通过嵌套的 `slots.inject()` 作为一组声明感知的注册集合安装。因此无论本行在侧边栏与会话声明者之前还是之后激活都能工作，任一声明收起时全部占位一并撤出，HMR 期间不会出现品牌混杂的中间态。本包不保留任何运行时状态。node 半边是一个空的 Loader 座位，浏览器标题仍属于本包之外的构建环境事项。

标记以 `currentColor` 绘制并取用 `ui-theme` 的品牌色阶，因此跟随主题而无需本包声明明暗分支。名称以产品字体排版：UnieAI 没有独立的字标图形。

## Model Experience

无，本包仅贡献浏览器呈现；此处没有任何内容进入模型请求。

#### KV Cache effect

无；本包既不组装也不发送供应商请求。

## Known Limitations and Deferred Work

- **本包只提供一组占位** —— 其他呈现方式应由占据相同槽位的另一个 Cordis 包提供。
- **浏览器标题独立于此** —— `DSH_CLIENT_TITLE` 在构建期选定标题文本，而非通过 UI 槽位。
- **标记为内联而非资源文件** —— 路径数据位于组件内，因此更换图形是源码改动而非替换文件。
