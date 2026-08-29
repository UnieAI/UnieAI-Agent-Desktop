# Agent Note：文件屬於右欄，不是蓋在對話上

Status: implemented

[English](2026-08-29-a-document-in-the-right-column.md) | 中文

## 問題

Univer Office 透過 `dsh-univer-office` 把試算表、文件與簡報帶進 harness，而它是用**浮動視窗**拖在對話上方呈現的。對一個不能假設有哪種殼的插件來說，那是個合理的預設；對這個產品來說是錯的：辦公文件在它開著的期間就是工作發生的地方，而一個蓋住逐字稿的視窗，等於逼人在「讀 agent 說了什麼」和「看它做出了什麼」之間二選一。

殼本來就有右欄，而且已經有主人。`details` 是 frame 層級的單一佔位插槽，由 ui-conversation 的 DetailsPanel 佔著，而且只要沒有當前 session，它的寬度就會收成零 —— 對工具細節來說這兩件事都是對的，因為工具細節屬於某個 session，而且是順手看一眼的東西。

## 決定

**一個右欄、兩個可能的佔用者，由版面決定顯示哪一個。**

`ui-layout` 在 `details` 旁邊宣告了一個 `document` 插槽，並依 store 的狀態渲染其中一個。`ctx.layout.openDocument()` 取得並打開這一欄；`closeDocument()` 把它還給 details 並關閉。document 是 `session-maybe`，在沒有當前 session 時仍然保持欄位開著，因為文件的壽命比產生它的那一輪長 —— 對 details 正確的那條 session 規則，會在編輯到一半時把 viewer 關掉。

另一個選項是並排兩欄。在筆電上那會讓兩邊都不能用，而且需求說的是側邊欄，單數。

**打開文件就擁有這一欄，關掉就還回去。** 不做分頁列：分頁等於要人管理兩個介面，而重點正是其中一個就是他正在做的事。寬度沿用 details 欄自己的契約，所以文件在一個已經調整過寬度的欄位上出現時，會保留主人選的那個寬度。

### 插件是 vendor 進來的，差異只在它渲染的位置

`dsh-univer-office` 宣告了八個 `@deepseek-ai/*` peer dependency，而 npm 與 bun 都會自動安裝缺少的 peer —— 就是這個 repo 已經修過一次的第二份 harness 下載（[原因](2026-08-28-peer-installed-upstream-duplicates.zh.md)）。所以它被 vendor 進來。

跟 `genui` 不同的是，**它自己的 bundle 沒有被改寫**。它的 host 半邊 import 上游名稱，而 vendored manifest 用 npm 別名把那些名稱指到我們的套件（`workspace:@unieai/uad-tools@*` 與同類）。解析成了一個 manifest 的事實；程式碼仍然是上游的，同步時也不必帶任何改名。

只有一個字串例外，而且會致命：`lib/client.js` 裡的 module-loader id。殼是用套件名稱去抓插件的 bundle，並且會拒絕一個用別的 id 註冊的 bundle —— 而那個拒絕不是局部的，是整個插件系統載入失敗。這次整合的第一次執行就是那樣：頁面寫著「Failed to load plugins」，而 harness 其他部分都好好的。

行為上的差異 —— 停靠而非浮動 —— 是原始碼的改動，所以五個被改的檔案放在 `vendor/univer-office/patch/`，而 `pnpm run sync-vendor-univer-office <version>` 會把它們覆蓋到乾淨的上游 checkout 上、用上游自己的建置腳本重建 `lib/`，並把 143 MB 的預建資產原封不動地從已發布的 tarball 取來。這個差異是一份誰都讀得到的 diff，不是誰的記憶。

dock 仍然掌管哪些檔案是開著的 —— 那段邏輯是上游的，而且是對的 —— 只是把它的視窗堆疊 portal 進欄位的 host。一個沒有 `document` 插槽的殼不會渲染出 host，而 dock 就跟上游一模一樣地浮動。

## 出貨這件事決定了什麼

這個插件的三個 runtime 依賴 —— `@univerjs-pro/cli-assets`、`engine-formula-rust-binding`、`exchange-node-binding` —— **完全沒有發布授權**：沒有 `license` 欄位，也沒有 LICENSE 檔。插件本身是 Apache-2.0；那涵蓋的是插件，不是它們。

`gen-third-party-notices` 擋下了建置，那正是它存在的理由。條款沒有被編造：`UNSTATED_TERMS_RUNTIME` 記下了它們是未聲明的、它們依 repo 擁有者 2026-08-29 的指示出貨、以及 dream-num 的書面確認仍未到位 —— 而 notices 也有一個專屬段落把這件事講出來。如果答案是不允許再散布，這個插件就會移出預設 bundle 變成選配安裝；這份筆記的其他內容都不會改變。

## 驗證

在真實瀏覽器中對著跑起來的 `rabi web`，視窗 1440×900：Univer 的 host 渲染在右欄裡（`col.contains(host)`），欄位寬 420 px、位在 x=1020，host 以 419 px 填滿它。`pnpm-lock.yaml` 裡沒有任何 `@deepseek-ai/` 套件。

`ui-layout` 涵蓋規則本身：欄位在開與關時更換佔用者，而且在沒有當前 session 時仍為文件保持開啟。把 frame 寬度計算裡的 `documentOpen ||` 拿掉，第二個測試就會紅。
