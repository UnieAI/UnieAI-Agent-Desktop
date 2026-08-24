# Agent Note：給人用的終端機

Status: implemented

[English](2026-08-24-operator-terminal.md) | 中文

## Problem

這套 harness 早就有 PTY,但沒有一個是人碰得到的。`ctx.terminals` 是為**模型**跑 shell 的:它把每個呼叫圍在一個活著的 `Agent` 上,靠輪詢讀一個有界視窗,而它的 bash 後端跑 `--noprofile --norc`,好讓模型在每台機器上遇到同一個 shell。這三件事對一次工具呼叫都是對的,對一個人都是錯的 —— 人要的是一個活得比任何一次對話更久的 session、輸出在產生的當下就到、以及自己的提示符與別名。

於是 Rabi 的右側面板能顯示這次工作階段產出了什麼、工作區裡有什麼,卻顯示不了終端機 —— 而那正是開發者在「接下來三十秒 agent 不是對的工具」時會伸手去拿的那個界面。

## Decision

`@unieai/uad-terminal-operator` 把 `OperatorTerminalService` 註冊為 `ctx.operatorTerminals`,疊在 agent 那一套所用的同一個 `ctx.subprocess.spawnTerminal` 原語之上,除此之外毫無共享。在那裡打開的終端機模型看不見,模型打開的終端機在面板裡也看不見。

協定是一個新的 `terminal` domain(`list/open/replay/write/resize/signal/close`)加上三個 `HostFrame` 變體。瀏覽器端由 `TerminalRuntime` 持有呼叫與訂閱,`TerminalTab` 用 xterm.js 渲染。

## Why each of these, and not the obvious alternative

**shell 不帶任何旗標啟動。** `argv` 就是 `[shell]`。在 PTY 上,bash 及其同類僅憑終端本身就認定自己是互動式的,因而讀取**互動式** rc 檔 —— `~/.bashrc`,oh-my-bash、starship、別名與提示符都住在那裡。`-l` 會讓它變成**登入** shell,轉而讀 `~/.bash_profile` 或 `~/.profile`,除非其中之一 source 了 `~/.bashrc`,否則會跳過它;一個把全部配置放在 `.bashrc` 的使用者,會在自己精心配置過的機器上拿到一個光禿禿的 `$`。Linux 的終端機模擬器正是為此啟動互動式非登入 shell。

**輸出走 HOST 事件串流,不走 mux 串流。** 每個 `MuxFrame` 都帶 `sessionId`。那樣劃分會把 shell 的生命綁在一次對話上:開一個新對話就會殺掉正在跑的 `npm run dev`。`HostFrame` 本來就在載工作區層級的 frame,而終端機屬於工作區。

**終端機釘在 loopback,但面板不因為非 loopback 就把那一列藏起來。** 七個方法都在 `PRIVILEGED_METHODS` 裡,非 loopback 呼叫方拿到 403 —— 那才是圍籬。早先的版本**還**在客戶端自認不在 loopback 時把選單那一列藏掉,結果是:透過通道、埠轉發,或用 `localhost` 而非 `127.0.0.1` 進來的人,發現這個功能無聲地不見了,而且沒有任何字可讀。一列點得下去、然後告訴你為什麼不行的列,是人可以據以行動的界面;一列不存在的列不是。

**尺寸是夾緊而不是拒絕。** 呼叫方是布局。隱藏的、正在掛載的、或拖動到一半的面板量出來是零或小數,而 PTY 兩者都拒收;拒絕會把一次普通的渲染變成一次失敗的按鍵。

**打開分頁是接回,不是新開。** 終端機活得比它的面板久正是重點所在,所以一個每次都**新開**的分頁會把上一個晾在那裡 —— 還在跑、看不見,並且一直佔著每工作區的名額,直到它成為使用者唯一撞得到的東西。分頁會認領該工作區裡活著的終端機,只有在沒有時才開新的;關掉分頁才真的結束它。

## Testing

31 個套件測試跑在假的 subprocess 接縫上,13 個跑在假的協定面上;兩者釘住的都是人說得出口的行為 —— 按鍵依序抵達、夾緊後的尺寸送達 PTY、已退出的終端機拒絕輸入、重新打開會接回。端到端的證明是真的瀏覽器對真的 Host:真的 bash、由 `~/.bashrc` 而來的自己的提示符、一行打進去被執行並回答。

## Alternatives considered

**用非 Agent 的 owner 複用 `ctx.terminals`。** 它的所有權圍籬、輪詢讀取模型、以及不載 profile 的 shell,每一項都需要一個例外,而每個例外都會變成一個註冊表裡的分支 —— 那個註冊表的全部契約就是「owner 是一個活著的 Agent」。在一個原語上放兩個註冊表,比在一個註冊表裡放兩套契約要少一些機械。

**把輸出掛在 mux 串流上並帶 session id。** 否決,因為那會讓使用者開新對話時 shell 就死掉 —— 見上面的決定。

**改用登入帳號當圍籬,而不是 loopback。** 當 loopback 釘死看起來會讓這個功能在已部署的 `uac.unieai.com` 上毫無用處時,我把這件事提給 owner。owner 定調:Rabi 是單機版,本來就走 `127.0.0.1`,所以只在 loopback 有的功能是正確的,不是缺口。釘死保留;錯的只是客戶端把那一列**藏起來**這件事。

**自己手寫終端機渲染器。** 一個 shell 和它跑起來的全螢幕程式會定位游標、重繪區域、切換備用畫面、以轉義序列上色。任何低於真正模擬器的東西,都會把 `vim`、`htop`,甚至一個有顏色的提示符,變成畫面上的垃圾。

## Consequences

面板現在能以啟動 Host 的那個帳號的身分執行任何指令 —— 終端機本來就是這個東西,這也正是那些方法釘在 loopback、而部署可以用 `enabled: false` 把這個界面移除的原因。它不是沙箱。

xterm.js 與它的 fit addon 是新的瀏覽器相依;xterm 的全域樣式表載入在應用外殼而不是面板所在的套件裡,因為它的 class 名是由函式庫自己寫進 DOM 的(CSS modules 會把它們改名),而且 tsdown 不解析來自相依套件的 bare specifier CSS。

`terminal.*` 加入 `PRIVILEGED_METHODS`,而 host 事件串流現在會為非 loopback 的對端過濾掉 `terminal/*` frame —— 一個不得開啟終端機的瀏覽器,也不該讀得到它。

## 真的瀏覽器抓到、而測試沒抓到的三個 bug

這三個都不會出現在單元測試裡,而且三個都會出貨。

1. **`cannot get property "panelTerminals" without inject`。** 套件用了一個沒有宣告的服務。面板在 shell 該在的位置顯示了這一行字。

2. **按鍵順序錯亂。** 每個按鍵是它自己的 HTTP 請求,而 HTTP 對兩個在途請求的完成順序不作任何承諾。打 `echo` 在真的 shell 上產生了 `ecoh`。寫入現在按終端機串成一條鏈 —— 按終端機,所以兩個面板不會互相等待;而且失敗的寫入不會毒死整條鏈,因為一個掉了一個封包就永久死掉的終端機,比一個掉了一個字元的更糟。

3. **一個 effect 依賴了自己的 callback 寫出來的狀態。** `TerminalTab` 的 effect 把 `onAttached` 列為依賴;`onAttached` 呼叫 `setState`,觸發重繪,重建那個 inline callback,於是 effect 再跑一次。每一輪都拆掉渲染器再接一個新的,按鍵因此落在已經在被丟棄的 xterm 實例上,一整行只有**最後**一個字元存活。接縫與那些 callback 現在住在 ref 裡,effect 只以工作區為鍵。

跟那個卡在「載入中」的檔案樹是同一類錯誤:一個 effect 讀了它自己寫的東西。

## Deliberately not done

- **從首頁進不去這個面板。** `AppFrame` 在沒有非空白工作階段時把 details 欄寬強制為零,而 `details` slot 是 session-scoped。要從空白畫面碰到終端機得改動那個契約,那是另一個有自己波及範圍的變更。
- **沒有鍵盤快捷鍵。** 參考設計每一列都有一個。這裡一個都沒綁,而一列旁邊擺一個按下去沒反應的提示,是在教人這個選單會說謊。
- **不做 session 持久化。** 終端機不會跨應用重啟存活,其 scrollback 只在記憶體裡。
