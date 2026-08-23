# Agent Note: 以组合替换实现 UnieAI 品牌

Status: implemented

[English](2026-08-22-unieai-rebrand.md) | 中文

## 问题

本仓库是 DeepSeek Harness 的 fork，作为 UnieAI 产品交付。所有承载品牌的界面仍然是 DeepSeek：侧边栏与 Hero 标记、浏览器标题、web manifest、favicon、React 挂载前的启动字标，以及首次使用的欢迎声明。`ui-theme` 中的蓝色是 DeepSeek 的品牌色阶。

品牌替换不能 fork 客户端 UI。本 fork 需要跟随上游，就地修改的部分会在每次同步时变成 rebase 冲突；而 `docs/web-styling.md` 禁止 Tailwind 与组件库，因此也无法直接引入参考产品的组件。

## 决策

品牌通过组合与 token 取值替换，绝不修改消费它们的界面本身。

`@deepseek-ai/dsh-client-ui-brand-unieai` 以与上游官方品牌包相同的嵌套 `slots.inject()` 生成器占据三个通用品牌槽位（`sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.brand.mark`），因此三个占位作为一个事务一并安装与撤出。web-app 名册移除 `ui-brand-official` 行，而不是遮蔽它：这些单元是 `single` 类型，两组占位会互相争夺。上游包原样保留在磁盘上并仍被客户端聚合引用，因此上游对它的改动仍能干净合并。

`--dsw-static-deepseek-*` 保留名称、更换取值：以色相 215 构建的 11 阶色阶，锚定使第 500 阶恰为 `#006AFF`，即 UnieAI 设计契约认可的唯一品牌色。第 800 与 900 阶向石板灰去饱和，与被替换的色阶保持一致，使既有消费点维持原有的视觉分量。重命名该 token 会波及每个消费点并在每次 rebase 时冲突，而用户看不到任何差别。

`--dsw-alias-brand-primary` 刻意不动。它解析为中性墨色并支撑 `--dsw-alias-button-primary-fill`；参考设计契约对同一角色独立地规定了中性墨色，两套系统本就一致。

标记以路径数据内联并使用 `fill="currentColor"`，颜色由该包 CSS Module 中的单条声明给出。名称以产品字体排版：UnieAI 没有独立的字标图形。

## 考虑过的替代方案

**遮蔽官方品牌行而非移除它。** 以更低的 `priority` 注册会让两个包同时挂载。已否决：官方包在非 `official` 构建配置下本就自行停用，因此这种遮蔽只在我们并不交付的配置中才起作用；而两组占位争夺 `single` 单元，比一行名册更难推理。

**将色阶重命名为 `--dsw-static-unieai-*`。** 语义上更整洁，因成本否决：它会波及每个消费点以及 token 定义块，此后这些行都会在上游 rebase 时冲突，换来的却是用户永远看不到的一个名称。

**移植参考产品的组件。** 被 `docs/web-styling.md` 排除，该文档禁止 Tailwind 与组件库，而参考产品正建立在这两者之上。

## 影响

功能包全部未改动。由于 `docs/web-styling.md` 禁止功能 CSS 写死颜色，仅更换一组色阶取值即触达所有界面；`ui-theme` 之外真正消费该色阶的调用点只有七处。

欢迎声明的版本号已提升，因此每位用户会再看到一次替换后的声明。

`LICENSE` 在 DeepSeek 之外新增一行 UnieAI 版权。MIT 条款要求原始声明在所有副本中保留，因此这是新增而非替换。

有两个测试固定了本次改动的字符串 —— 启动字标与欢迎文案原文 —— 已随其描述的行为一并更新。

## 暂缓

字体未改。参考产品使用 Geist，通过此处不存在的框架字体管线加载；采用它意味着将字体文件纳入仓库，属于需要单独进行许可审查的另一次改动。

Studio 设备授权流程引入的登录页会内联重述约十五个 token 取值，因为它在任何客户端 bundle 存在之前就已送出。该重复是可接受的，并归属于那次改动。
