# ssh/ — 透過 OpenSSH 的遠端機器

[English](README.md) | 中文

把一個執行世界放到使用者本來就連得到的機器上，用的是他電腦上本來就有的 `ssh` 客戶端。組合方式由[可攜執行世界的決策](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.zh.md)決定：`ctx.fs` 與 `ctx.subprocess` 合起來定義一個世界，而其上的每一項能力——Bash、常駐終端機、language server、檔案工具——消費的是這兩個介面，而不是指名某個 provider。

| 套件 | ctx key | 角色 |
|---|---|---|
| [`ssh`](ssh/README.zh.md)（`@unieai/uad-ssh`） | `ctx.ssh` | 使用者自己 OpenSSH 設定裡的機器、alias 實際解析成什麼，以及每台機器一條重用連線 |
| [`subprocess-ssh`](subprocess-ssh/README.zh.md)（`@unieai/uad-subprocess-ssh`） | `ctx.subprocess` | 把每一份 spec 改寫成 `ssh` 呼叫，讓所有指令跑在那台機器上；終止一次執行則是對它的遠端行程群組送訊號 |
| [`fs-ssh`](fs-ssh/README.zh.md)（`@unieai/uad-fs-ssh`） | `ctx.fs` | 以 POSIX shell 指令走共用連線提供那台機器的檔案，含原子寫入與一次往返的目錄列表 |

遠端機器上不安裝任何東西。一套遠端開發伺服器會變成另一個要版本控管、要部署、要維持相容的東西；而上面那兩個接縫只需要一個 shell 和一個檔案系統，那是 sshd 本來就提供的。

邊界跟 E2B 畫的是同一條：遠端擁有可變的檔案系統、指令、終端機與 language server 行程，harness 則保留 Cordis 與外掛物件、agent 迴圈、session 狀態與持久化、模型呼叫、prompt、工具與授權。這裡沒有任何東西會把 harness 本身搬過去。
