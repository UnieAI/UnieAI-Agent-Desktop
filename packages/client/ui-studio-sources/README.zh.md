# @unieai/uad-client-ui-studio-sources

[English](README.md) | 中文

Studio MCP 結果底下的知識庫引用：這個答案來自哪些文件、每段落在第幾頁、搜尋的相關度有多高。

## 出現在哪裡

詳細面板中，所選工具呼叫的 Output 底下，位於每次呼叫的 `conversation.details.tool.annotation` 清單。

是註記而不是工具檢視：引用屬於結果**旁邊**，不是取代結果。而且 keyed 的 `tool.call.toolview` 座位根本容納不了這個佔位者——MCP 工具的名字是 `mcp__<serverName>__<rawName>`，server name 由部署方決定，沒有可以註冊的 key。因此這個佔位者會看到使用者打開的每一次呼叫，自己讀名字，遇到不認得的就什麼都不畫——而那是大多數情況。

## 它拒絕顯示什麼

- **還在執行的呼叫。** 還沒有結果。
- **失敗的呼叫。** 它的文字是錯誤訊息，不是 reader 看得懂的答案。
- **工具沒有回報的分數。** 沒有分數不等於零分，顯示 `0%` 會是伺服器從未給過的斷言。

每一列都不是連結。桌面版打不開 Studio 的文件，做成連結就是承諾一個這裡不存在的去處。

## 解析在哪裡

在 `@unieai/uad-studio-kb-sources`，它不需要 host：文字本來就在瀏覽器裡，就在使用者打開的那個結果中。那個套件負責解析，這個套件決定**何時**解析、以及一列要怎麼讀。沒有名字的文件也由這裡命名，因為那是翻譯，而解析器沒有語言。

## Model Experience

無。此套件不註冊任何 tool、prompt、schema 或 context：它重讀模型已經產生的結果，讓人看到出處。

#### KV Cache effect

無。這裡不貢獻任何 prompt 片段、工具定義或 context 條目，因此不會移動任何重用邊界。

## 已知限制與未完成項目

- **回不到原文件。** 搜尋結果帶有 evidence id（`<kbId>:<docId>:<idx>:<digest>`），但桌面版沒有地方可以帶它去；等 Studio 文件路由存在時，這一列就會變成它現在刻意不去假裝的那個連結。
- **只涵蓋 Studio 的兩個工具。** `kb_search` 與 `kb_grep` 回報 reader 看得懂的引用；`kb_fetch` 與 `kb_list` 回的是別的東西，這裡不顯示。
- **每次打開呼叫都會跑一次。** list 洞沒有 key，所以辨識的成本是每次所選呼叫做一次字串比對——可以忽略，但這正是它沒有做成 keyed 註冊的原因。
