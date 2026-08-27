# @unieai/uad-remote-machine

[English](README.md) | 中文

把執行世界放到一台透過 SSH 連到的機器上的 bundle。其他一切原地不動。

## 它改了什麼

兩列，而且只有兩列：`ctx.fs` 與 `ctx.subprocess`。這兩者合起來定義一個執行世界，所以換掉它們就把 Bash 工具、檔案工具、搜尋、language server 與終端機都搬到那台機器上——而那些套件一個都沒有改，甚至不知道發生過這件事。

harness 本身不會搬家。Cordis 與外掛物件、agent 迴圈、session 狀態與持久化、模型呼叫、prompt、工具與授權，全部留在安裝 Rabi 的那台電腦上。跨過網路的只有指令與檔案操作，沒有別的。

用哪一台機器來自 `DSH_SSH_MACHINE`，名字就照使用者自己 `~/.ssh/config` 寫的那樣。這裡沒有第二本機器名冊，也不保存任何憑證——那些是 OpenSSH 的。

## 安全上的事實

本機的 sandbox 相關列會被關掉，而這是刻意的、不是順帶的：seatbelt、Landlock 與那些沙箱化執行器約束的是**這台**電腦上的行程，對另一台電腦上的行程它們無能為力。因此 `sandbox-policy` 明白寫成 `danger-full-access`——一個承諾了沒有任何 provider 能兌現的約束的模式，會在第一次 spawn 時才失敗，而不是在載入時。

那台機器上的工作，界線是那台機器自己的帳號權限——與使用者從自己終端機登入時拿到的完全相同——以及 harness 的核准提示，那仍然守著每一次工具呼叫。

## 怎麼用

```sh
DSH_SSH_MACHINE=build-box rabi --profile remote-machine "run the test suite"
```

`DSH_SSH_CWD` 設定機器上相對路徑要解析的基準目錄，而且它必須在組合裡指名它的三個地方保持一致——檔案系統 provider、sandbox 政策、以及 Bash 執行器。這裡它們是一起設定的；改其中一個的 overlay 必須三個一起改，否則路徑會在一個世界裡解析、在另一個世界裡執行。

同一套組合的可執行範例在 [`examples/headless-agent/ssh.cordis.yml`](../../../examples/headless-agent/ssh.cordis.yml)。

## Model Experience

無。這個 bundle 什麼都不註冊：它是一份組合 patch，而被它換了機器的那些工具，各自記錄自己面向模型的契約。

#### KV Cache effect

無。這裡不產生任何 prompt 片段、工具定義或 context 條目。

## 已知限制與未完成項目

- **一個行程一台機器。** alias 是設定，所以每一個 session 都跑在同一台機器上。要按 workspace 選擇，需要一個 harness 目前還沒有的路由器。
- **碰不到本機檔案。** 執行世界一旦在遠端，工具就完全碰不到安裝 Rabi 的那台電腦——世界只有一個，而它是那台機器的。
- **本機 sandbox 是關的。** 上面說過，這裡再說一次，因為那是掛上這個 bundle 之前最值得知道的一件事。
