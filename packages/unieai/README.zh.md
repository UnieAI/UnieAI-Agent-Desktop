# unieai/ —— UnieAI 产品层

[English](README.md) | 中文

使这个 harness 成为 UnieAI 桌面产品、而非一个通用组合的包。它们独立成组，因为上游永远不会创建这个目录，rebase 时便不会与它们冲突。

| 包 | 角色 | ctx key |
|---|---|---|
| [`web-gate/`](web-gate/README.zh.md) | 浏览器登录闸门：`/auth/*`、登录页与请求守卫 | 无服务；占用 `webServer` 的守卫席位 |
