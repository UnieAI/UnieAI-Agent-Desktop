# Agent Note: a plugin is what you hand somebody

Status: proposed

[English](2026-08-29-a-plugin-is-what-you-hand-somebody.md) | 中文

## Problem

這個 repo 已經有一個擴充所需要的每一個零件，卻沒有一個名字可以叫「人真正會去安裝的那個東西」。

`ctx.skills` 登記教模型做法的文件。`ctx.tools` 登記帶 schema 的能力。`ctx.connectors`（新的）持有對外部服務的存取權。`ctx.slots` 讓一個套件貢獻 UI。`ctx.mcp` 連上 MCP 伺服器。Cordis 從 `cordis.yml` 把這些全部掛起來。一個想出貨「Rabi，但是給法律合約用的」的人，得交出五個彼此無關的產物，外加一段說明每一個該放哪裡的文字。

而「plugin」這個字在這裡已經被佔用了，它指的是最小的那個東西：一個帶 `apply` 與 `inject` 的 cordis 單位。每一個套件都是一個。那對機制來說是對的字，對產品來說是錯的字。

## Proposal

**Bundle：一個目錄，指名它包含的 skill、connector、agent 與介面，當成一個單位安裝。** cordis plugin 維持原樣——它是 bundle 被組裝起來的機制——而 bundle 才是人選擇的東西。

業界已經收斂到同一個形狀，值得對齊而不是自己發明：

| 職責 | Anthropic | 這個 repo 今天 |
|---|---|---|
| 教模型做法 | plugin 裡的 `skills/` | `ctx.skills`，而 `vendor/univer-office` 已經出貨八份 |
| 接外部服務 | plugin 裡的 `.mcp.json` | `ctx.connectors` + `packages/mcp/mcp-client` |
| 專職工作者 | plugin 裡的 `agents/` | `ctx.subagent` + agent preset |
| 具名呼叫 | plugin 裡的 `commands/` | `ctx.commands` |
| 被安裝的那個單位 | `.claude-plugin/plugin.json` | **沒有** |

Google 的 Gemini Enterprise for Legal 出貨的是同樣四個部分、換了名字——「purpose-built Skills、MCP Connectors、pre-built Agents，以及一個受治理的控制台」——只是它做成一個垂直產品，而不是一個任何人都能發布的格式。那個格式才是比較值得抄的一半。

**Manifest 就是整個提案。** 一個 bundle 是一個目錄，帶著指名它內容的 manifest；安裝它就是把每一個部分透過已經擁有它的那個接縫掛上去。沒有任何新東西在跑——manifest 是一份組裝，而 cordis 本來就會組裝。

**Bundle 透過 slot 系統貢獻 UI，不是透過模板。** `vendor/univer-office` 就是證明：一個第三方介面可以佔住殼的座位，它拿下了右欄，而它的 dock 渲染在裡面。一個想要「優化過程圖表」的 bundle 就說它要哪個座位、並出貨一個 client 半邊，跟這裡的套件做法一模一樣。

### 第一個 bundle 會是什麼

Office 自動化，因為它四種零件各需要一個，而且它對「零件之間的界線」很誠實。

**skill 就是它今天的全部**：驅動 Excel、Word 與 PowerPoint 在 macOS 上是 `osascript`、在 Windows 上是 PowerShell COM，而兩者本來就透過 shell 工具抵達模型。缺的不是能力，是知識——哪一本字典、怎麼定址一個範圍、怎麼存檔不跳對話框、怎麼不留下一個看不見的行程。一份 `SKILL.md` 正是那個。

它在有人想要下面這些時才賺到其他部分：一個帶 schema 的**工具**（而不是每次讓模型現寫 AppleScript）、一個記得「哪台機器的 Office」的**connector**、以及一個在存檔前顯示「哪些儲存格會變」的**介面**。每一個都是一個理由，而沒有一個是「一開始就從那裡做」的理由。

## Alternatives considered

**把 bundle 叫做 plugin，然後替 cordis 單位改名。** 那個機制在 cordis 自己的詞彙裡、在這裡每一個檔案裡、在 loader 的錯誤訊息裡都叫 plugin。為了空出一個字而替它改名，要動到每一個套件，換到的只是一個字。

**用 npm 套件散布 bundle。** 它們本來就能解析、版本化與安裝。但 `bunx @unieai/rabi` 已經示範過「當有 peer 時，安裝一個套件」意味著什麼；而且對一個非技術使用者要從清單裡挑的東西來說，npm install 是很差的配適，並且會讓每一個 bundle 都變成一次發布事件。

**把 bundle 做成 preset。** `packages/preset` 從一份 `cordis.yml` 組出一個 agent，那已經是大部分機制。但對人來說那是錯的名詞：preset 設定的是 agent，而 bundle 帶來的是能力、存取權與一個介面。

**原樣採用 Anthropic 的 plugin 格式。** 相容性上很誘人，而它預設了他們的 runtime——`commands/`、`agents/` 與 hooks 是他們的，形狀跟這裡的接縫對不起來。抄**結構**是划算的；抄檔案格式買到的是一條我們沒有消費者的匯入路徑。

## Acceptance criteria

- 一個帶 manifest 的 bundle 目錄可以安裝，而它的 skill、connector 宣告與 UI 座位全部生效，不需要編輯任何其他檔案。
- 解除安裝會移除每一項貢獻，並且不動已儲存的授權——一個人的核准不是安裝程式可以丟掉的東西。
- 一個指名了「這個部署滿足不了的 connector」的 bundle 仍然安裝得起來，並說出哪一部分是無效的；因為一個消失的 bundle 看起來就像一個不存在的 bundle。
- Office bundle 是真的：它的 skill 在一台真的機器上驅動一份文件，而它不需要的部分是缺席，不是打樁。

## Risks

**一個 bundle 是帶著 harness 觸及範圍的任意程式碼。** skill 是文件、connector 是宣告，但 client 半邊是跑在殼裡的程式碼，而工具是跑在機器上的程式碼。散布在需要 marketplace 之前，先需要一個「這是誰寫的」的答案，而這個 repo 沒有簽章機制。

**這些接縫的成熟度不一致。** skill、工具與 slot 是成熟的。connector 只有兩天大，沒有 UI，也沒有 host 路由。一個假設四者都完成的 bundle 格式，會把不存在的能力寫進文件。

**一個目錄，四種讓人失望的方式。** 一個 skill 載入成功、connector 驗證失敗、agent 需要這個部署沒有的模型、而面板想要這個殼沒有宣告的座位的 bundle，必須把四個局部失敗解釋清楚，而且不能讓整體讀起來像壞掉了。
