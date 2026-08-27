# machines/ — 工作發生在哪裡

[English](README.md) | 中文

一個人的工作總是發生在某個地方：這台電腦，或是他本來就連得到的某台機器。這個群組讓「哪一台」變成當下的選擇，而不是開機時就定死的組合決定。

| 套件 | ctx key | 角色 |
|---|---|---|
| [`machines`](machines/README.zh.md)（`@unieai/uad-machines`） | `ctx.machines` | 使用者可以挑的機器，以及現在正在用的那一台 |
| [`execution-router`](execution-router/README.zh.md)（`@unieai/uad-execution-router`） | `ctx.fs`、`ctx.subprocess` | 一台機器一個執行世界，每次呼叫都路由到對的那一個 |

兩個 provider 必須一起掛載：`ctx.fs` 與 `ctx.subprocess` 定義的是**一個**執行世界，把它們路由到不同機器，會用一種接縫之上沒有任何消費端偵測得到的方式破壞它。至於為什麼它們之上的每一項能力都與 provider 無關，由[可攜執行世界的決策](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.zh.md)負責說明。
