# 開發 UnieAI Agent

[English](unieai-development.md) | 中文

UnieAI Agent 是 UnieAI Copilot 網頁產品的桌面個人版，建構在這個 DeepSeek Harness 的 fork 之上。這一頁是同事在自己機器上把它跑起來所需要的全部；除了一個 shell 和網路連線之外，它不假設那台機器有任何東西。

## 誰跟誰講話

桌面端跑的是一個本機 harness。所有跟帳號有關的東西——你是誰、你可以用哪些模型、方案還剩多少用量、你的 Studio MCP 伺服器——都是透過一個叫 `unieai-web-gate` 的外掛，用 HTTPS 向**網頁產品**取得的。

那個產品是獨立的部署，**不需要**在你的機器上。**gate 預設就指向 `https://agent.unieai.com`**，所以在另一個城市的筆電上全新 clone 一份，不用做任何設定就能用：用裝置碼登入，帳號相關的畫面就會填上資料。今天兩者在同一台機器只是這份程式最初的開發環境如此，不是必要條件。

只有當你想指向自己跑的 copilot-v2 時才需要改東西，見下方「指向你自己的 copilot-v2」一節。

## 前置需求

**Node.js 22.19 或更新**（或 24+）。這不是建議。在 Node 20 底下，錯誤訊息完全不會提到版本，而且會把你帶往錯誤的方向：`pnpm` 會說 *"Failed to switch pnpm to v11.7.0 — pnpm CLI is missing"*，直接跑 `tsdown` 則會說 *"Failed to import module 'unrun'"*。兩者都不是安裝壞了。在追查任何其他東西之前，先 `node -v`。

`pnpm` 由 `packageManager` 欄位決定；用 Corepack 或全域安裝的 `pnpm` 都可以。

## 第一次跑

```sh
git clone https://github.com/UnieAI/UnieAI-Agent-Desktop.git
cd UnieAI-Agent-Desktop
pnpm install
pnpm run build
pnpm uad web
```

`pnpm uad web` 會印出它綁定的網址並開啟瀏覽器。加 `--no-open` 可以留在終端機，加 `--port <n>` 可以指定連接埠，預設是 3080。

從側邊欄最下面的帳號列登入。它走的是裝置碼流程：桌面端顯示一組代碼，你在網頁產品上核准，之後桌面端就持有這個 session。

## 開發瀏覽器端 UI

`packages/client/` 底下的套件就是 UI。關於它們有兩件事，在這個 repo 裡比其他任何事都更浪費時間：

**測試讀原始碼，瀏覽器讀產物。** `vitest` 會把 workspace 的 import 解析到 `src`，所以測試可能對著一份執行中的 app 從沒見過的改動通過。改完任何 client 套件後要重新建置——單一套件用 `pnpm --filter <套件名> run bundle`，全部則用 `npx tsdown --env.DSH_BUILD_FACE client`——然後重新整理。如果某個改動「沒有生效」而測試是綠的，先比對產物和原始碼的時間戳，再去看別的地方。

**`ui-primitives` 是函式庫，不是外掛。** 它的程式碼是被內聯進每個使用者，而不是自己載入的，所以只建它是不夠的：所有 import 它的套件事後都要跟著重建。全部重建是可靠的做法。

## 指向你自己的 copilot-v2

在你 profile 的 patch 層 `~/.dsh/profiles/web/cordis.patch.yml` 裡，設定 `unieai-web-gate` 這一列的 `productUrl`。

**patch 會整段取代它所指向的那一列的 `config`。** 請把該列擁有的每一個鍵都重寫一遍，而不是只寫你要改的那一個——一份只寫了 `productUrl` 的 patch，會把 `enforce` 和 `allowedUserIds` 一起悄悄弄丟。

```yaml
- action: patch
  id: unieai-web-gate
  config:
    productUrl: 'http://192.168.1.50:3000'
    enforce: true
    allowedUserIds: []
```

那一列擁有哪些鍵，以 `packages/bundle/web-app/cordis.patch.yml` 為準；從那裡把整段複製過來再改。

自架產品要注意兩件事：

- **它必須能從桌面端那台機器用那個網址連到。** 這個檔案裡的 `localhost` 指的是跑 harness 的那台機器，除非兩者是同一台，否則不是跑 copilot-v2 的那台。
- **帳號畫面需要的 desktop 路由必須存在。** 它們在 copilot-v2 的 `app/api/desktop/` 底下。比某條路由更舊的部署會回 404，受影響的頁面會直說，而不是看起來壞掉。

## `allowedUserIds`

gate 可以把這台主機釘給特定帳號。出貨的 bundle 釘了一個——這份程式最初開發的那台機器——而那一筆正是同事在自己的 clone 上登入會被拒絕的原因。

在你自己的 patch 裡把它留成 `[]`，讓第一個登入的帳號取得這台主機；或是把你自己的 user id 填進去。無論選哪個都值得刻意決定：這台主機跑的 agent 握有 bash 和檔案系統工具，所以誰擁有它是一個存取決策，而不是一個預設值。

## 桌面應用程式

`apps/desktop` 是一個 Electron 視窗，罩在它自己啟動的 harness 上。它不加任何產品行為：它在一個由作業系統指派的 loopback 連接埠上啟動 `uad web`，等那個伺服器印出網址那一行，然後載入它。

```sh
pnpm --filter @unieai/uad-desktop run start
```

打包是分平台的，而且拒絕跨平台編譯，因為封閉集裡帶著在安裝時依平台與架構挑選的原生二進位檔。macOS 版要在 macOS 上建，Windows 版要在 Windows 上建。見 [`apps/desktop/README.zh.md`](../apps/desktop/README.zh.md)。

## 檢查

跑你的改動涉及的部分，而不是全部：

```sh
npx tsc --build tsconfig.client.json          # client packages typecheck
npx vitest run packages/client packages/host  # the GUI suites
npx tsx scripts/run-oxlint.ts packages/client # lint
pnpm run doc-sync                             # documentation gates
```

詳盡的那一輪由 CI 負責。覆蓋率的 gate 是 `pnpm run test:coverage`，不是 `pnpm run test`。
