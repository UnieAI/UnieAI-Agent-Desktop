# Agent Note: the client announces what moved, because a surface cannot tell silence from stillness

Status: implemented

[English](2026-08-29-the-client-announces-what-moved.md) | 中文

## Problem

殼裡有兩個控制項按下去沒有任何可見反應，底層原因相同，而兩者都被當成壞掉的按鈕回報。

**新聊天。** `workspaces.startSession()` 會重用一個 workspace 既有的空白 session，而不是鑄造看不見的重複品——這條規則是對的，也留著。所以一般情況會解析到那個已經是當前的 session，`sessions.open(id)` 選中一個早就選中的東西，畫面上什麼都不動。一個已經在輸入框打了字、然後按下新聊天的人，草稿和視圖都留在原處：對他來說按鈕是死的。什麼都沒有被記錄，因為什麼都沒有失敗。

**換機器之後的監控條。** 這條橫條每四秒輪詢一次，輪詢失敗時留住上一份讀數，這是對的——漏掉一次採樣，仍然由前一次採樣描述得最好。但它沒有辦法把那件事跟「這份讀數講的是*另一台機器*」分開。所以換機器後最多四秒內，一台機器的數字掛在另一台機器的名字底下；如果兩台相近，這條橫條看起來就像從來沒變過。

共同的形狀是：一個持有 per-session 或 per-machine 狀態的介面，分不出「什麼都沒發生」與「發生了什麼，但沒人告訴我」。

## Decision

**兩件事都在 client 自己的事件匯流排上宣告，而且由 client runtime 宣告型別。**

`workspaces/new-session(sessionId | undefined)` 對新聊天的**每一種**結果都發，包括什麼都沒動的那一種，也包括沒有 workspace 可連、選擇被清空的那一種。`ui-conversation` 監聽並清掉那個 session 的草稿——但只透過 `InputHub.existing(id)` 這個不會建立實例的查找，所以剛鑄造出來的 session（還沒有輸入框）與別的 session 的草稿都不會被碰。

`machines/changed(machine)` 只在機器真的移動時才發：選擇器在 host 回答前後比對當前機器，所以被拒絕的切換與重選當前這台都不宣告任何事。`ui-machine-gauges` 監聽並呼叫 `resample()`：它放棄還在飛的那次輪詢、**丟掉**讀數而不是留著，並立刻重讀——而在沒有人看著這條橫條時它什麼都不做，因為下一次掛載本來就會讀到新的。

**兩個事件都由 `@unieai/uad-client-runtime` 宣告，而不是由發出它們的套件宣告。** 移動的是執行世界與 session 選擇：那是關於 client 的事實，不是關於任何單一控制項的。把 `machines/changed` 宣告在 `ui-machines` 裡，會讓每一個描述機器的介面都相依於那個選擇器，方向是反的——監控條這個套件的整個設計，正是它不知道機器是什麼，而是透過 host 採樣。

**清掉未送出的草稿是被請求的動作，不是資料遺失。** 人按了新聊天。另一條路——把有草稿視為 session 不空白、於是鑄造一個新的——一樣會丟掉草稿，還多出一個「打了字又反悔」就多一個隱藏 session。

## Alternatives considered

**讓 `startSession` 自己清草稿。** runtime 得知道輸入框草稿是什麼，而草稿住在 `ui-conversation` 裡、在一個 per-session 的輸入狀態機後面。事件保住了分層，兩邊各付一行。

**只在有變化時才宣告。** 對機器是對的，對新聊天是錯的：那裡值得回報的情況，恰恰是什麼都沒動的那一種。兩個事件在這一點上是刻意不同的。

**讓監控條輪詢得更快。** 四秒已經是一次跑在別人機器上的命令；更短的間隔會花掉更多次，只為了縮短一個只在切換當下存在的窗口。事件只在值得的那一刻多付一次讀取。

**讓監控條留著舊讀數，直到新的抵達。** 那是輪詢失敗的規則，套用在這裡等於宣稱新機器看起來跟舊的一模一樣。而「沒有讀數」正是這條橫條在第一次採樣之前本來就會畫的東西。

**讓 `ui-machine-gauges` 為了事件型別相依 `ui-machines`。** 少一個宣告點，但把相依方向倒過來：一個描述機器的介面，會去 import 那個改變機器的控制項。

## Consequences

兩件 client 層級的事實現在有了具名的觀察點，而下一個需要它們的介面——換機器時該重讀的檔案樹、新聊天時該重置的面板——用訂閱，而不是輪詢或跨套件伸手。代價是兩個事件都必須持續發出：任一呼叫點被刪掉的 emit，就是一個重新變安靜的按鈕，所以兩者都有測試涵蓋，而拿掉 emit 會讓它變紅。

`InputHub.existing()` 是一個 package-internal 註冊表上的新公開介面。它存在的理由是：一個對「發生在某個 session 身上的事」做出反應的呼叫者，不該因為看一眼就把那個 session 的輸入狀態機建出來。

## Verification

在跑起來的 `rabi web` 上、接著一個真的 workspace：在輸入框打字後按新聊天，textarea 變空，且沒有 console 錯誤——正是先前會留住草稿、什麼都不變的那個狀態。

單元測試釘住兩條規則，而各自的變異都會讓它變紅：workspaces service 宣告它落定的那個 session（包括已經是當前的那個），並在選擇被清空時宣告 `undefined`；選擇器宣告真正的移動，而重選當前這台時保持沉默；監控條的 view 在 `resample()` 時丟掉讀數並重讀，而在沒有讀者掛載時什麼都不做。

監控條的端對端這一段**沒有**被涵蓋：橫條住在 `conversation.session.header.gauges`，而標頭在 session 空白時會隱藏自己，所以瀏覽器探針在沒有真實輪次的 session 下觀察不到 resample。
