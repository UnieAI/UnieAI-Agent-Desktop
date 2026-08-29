# Agent Note: a resident seat at each end of the composer's tool row

Status: implemented

[English](2026-08-29-a-resident-seat-at-each-end-of-the-tool-row.md) | 中文

## Problem

機器選擇器坐在輸入框工具列的左端、指令按鈕旁邊，而且它是 `conversation.input.chrome` 唯一的佔用者。它同時有三件事是錯的，而回報的人是把它們當成一件事回報的。

它是一個文字晶片，而那一列其他控制項都是 32 px 的圖示，所以它讀起來像標籤，不像可以按的東西。它的選單寬 220 px、沒有最大高度，所以機器一多，清單就跑出畫面外，而且沒有東西可以捲。而選單的表面是 `var(--dsw-alias-surface-raised, #fff)`——**這個 token 在這個 repo 裡任何地方都沒有定義**，所以永遠是 fallback 勝出，在深色殼上就是一張白卡片。那一列其他每個下拉選單早就在用 `--dsw-specific-menu`，而主題會重新綁定它。

選單也永遠往上開（`bottom: calc(100% + 6px)`），包括在 hero 畫面上——那裡輸入框置中，上面根本沒有東西。

## Decision

**工具列有兩個常駐端點，而它們是同一個座位的兩份。** `conversation.input.chrome.end` 宣告在 `conversation.input.chrome` 旁邊：同樣是 `list`、同樣 root scope、同樣的 owner share，只差渲染在哪一端。機器選擇器搬了過去。

Root scope 是吃重的那一半。`conversation.input.right` 是既有的右端座位，而它帶著 `InputZone`，所以在 session 存在之前無法渲染——而工作在哪裡跑，在任何人開始一段對話之前就是真的，這正是選擇器需要一個常駐座位的原因。這個端點座位渲染在 trailing 群組，排在圖示群的第一個，讓送出鍵仍然是那一列最後的控制項。

**在本機時是圖示，在別處是帶名字的晶片。** 一個筆電字符與那一列其他圖示相稱；工作一旦離開這台電腦，機器的名字就出現。舊晶片無條件寫著機器名，那正是它看起來像標籤的原因；而完全拿掉名字則會失去真正重要的性質，因為圖示說不出是*哪一台*機器。

**選單就是模型選擇器那張卡片，重述一次。** 同樣的表面 token、邊框、圓角、陰影與捲軸重綁，加上 320 px 最小寬度與 420 px 最大高度，而且只有機器清單會在裡面捲動。「新增機器」與設定檔提示留在原位，所以有三十台主機的人不必捲過全部才能碰到他真正要的東西。

**它往下開，只有在輸入框停靠之後才往上。** 依據殼的 phase，抄自模型選擇器，理由也是它的理由：逐字稿欄會長到輸入框需要的高度，所以往下的選單永遠「放得下」，然後蓋住打開它的那個控制項。沒有可以量測的剩餘空間。

## Alternatives considered

**把選擇器搬進 `conversation.input.right`。** 少一個 key，而且是錯的：那個座位綁 session，控制項會從 hero 畫面消失——而那正是選機器決定一個人能挑哪些資料夾的唯一場合。

**重新定義 `conversation.input.chrome`，讓它渲染在右端。** 同樣少一個 key，但它會悄悄搬走一個已發布擴充點未來任何佔用者的位置。左端是個正當的座位，只是今天沒有佔用者；替第二個命名，比搬走第一個便宜。

**把缺少的 `--dsw-alias-surface-*` token 定義出來。** 那些 fallback 所指的顏色得替兩種主題各自發明，而那一列早就有一個專門給這個表面的 token。在 `--dsw-specific-menu` 旁邊再造一套平行刻度，正是兩個選單開始長得不一樣的起點。

**永遠在晶片上保留名字。** 那是資訊量最大的狀態，也正是這個控制項讀起來不像可按的原因。無論如何圖示都透過 `aria-label` 帶著身分，所以螢幕閱讀器沒有損失。

## Consequences

機器選擇器現在離送出鍵只有三個控制項，而不是在列的另一頭——那正是一個人問「這會在哪裡跑」時眼睛會去的地方。代價是多一個 SlotMap key 要維護文件，以及一個出貨時沒有佔用者的 `conversation.input.chrome` 座位：一個已發布的擴充點，存在的理由是左端仍然是常駐 chrome 的合理去處，而不是今天有什麼需要它。

這個套件裡兩個被發明出來的 token 沒了（`--dsw-alias-label-danger`、`--dsw-alias-label-success`，以及那兩個 surface 名稱），換成真的那些。repo 裡沒有其他地方引用它們，所以沒有別的介面改變。

## Verification

在跑起來的 `rabi web` 上、以真實瀏覽器於 1440×900 量測，兩種主題都測：觸發器位在 x=1064，介於指令鍵（475）與語音（1147）、送出（1185）之間；選單寬 330 px，`max-height: 420px`，清單 `overflow-y: auto`；淺色下背景解析為 `rgb(255, 255, 255)`、文字 `rgb(13, 13, 13)`，深色下為 `rgb(63, 63, 63)` 與 `rgb(236, 236, 236)`；右緣沒有跑出畫面。在本機時觸發器量得 32×32，選了遠端機器後長到 77 px 並帶著 `testbox`。在 `data-phase="active"` 下，選單翻到觸發器上方。
