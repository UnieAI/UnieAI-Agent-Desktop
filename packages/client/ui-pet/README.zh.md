# @unieai/uad-client-ui-pet

[English](README.md) | 中文

視窗角落的小夥伴，會依代理正在做的事改變動作；外掛頁有一張卡片可以挑選或關掉它。

預設關閉。第一次啟動就自己冒出來的寵物，是別人工作區角落的一個驚嚇；想要的人自己去打開。

## 它在反應什麼

只有使用者正在看的那個 session，其他都不看。`running` 是 harness 自己對「這一輪是否進行中」的答案，`runningCalls` 則區分「模型在想」與「模型已經派工出去」：

| Session | 反應 | 動畫 |
| --- | --- | --- |
| 靜止 | `idle` | idle |
| 一輪開著、還沒派工 | `thinking` | review |
| 有工具呼叫進行中 | `working` | running |
| 正在等人回應 | `waiting` | waiting |

這裡不讀模型輸出。會從文字推測語意的寵物，錯的時候沒有人能糾正它——而且會剛好在使用者正在讀那段文字的時候錯得最顯眼。

`waiting` 刻意不等同於 `idle`：正被等待的那個人，正是最該一眼看出差別的人。

## 圖檔

寵物用的是 [OpenPets](https://github.com/alvinunreal/openpets) 的 "Codex" 圖集（MIT，`apps/web/public/pets/LICENSE`）。一張圖是固定的 1536×1872 網格：8 欄 × 9 列、每格 192×208，一列一個動畫。這些圖集本身不帶 metadata，所以這幾個數字**就是**契約，只寫在 `src/codex.ts` 一處，由繪圖端與測試共同讀取；尺寸不符的圖集會畫成亂碼，而不是報錯。

它們是 `apps/web/public/pets/` 下的靜態檔，不是這個套件 import 進來的資產。1.7 MB 的圖集若由瀏覽器端 import，會以 base64 躺在 `client.js` 裡，不管有沒有開寵物、每次載入都要付這個成本；改成靜態檔後，瀏覽器只抓正在用的那一隻，而且會被快取。

## 繪製

一張 canvas，換格時一次 `drawImage`。用 canvas 而不是用計時器推 `background-position`：後者會讓一個疊在整個 app 上的元素每格都觸發一次樣式重算。格號由時鐘算出而非累加計數，所以被切到背景的分頁回來時會接在動畫真正的位置，而背景分頁根本不畫。

dock 與 sprite 都是 `pointer-events: none`。overlay 座位覆蓋整個 app 範圍，一個會吃掉點擊的透明區塊，跟壞掉的頁面沒有分別。

## 使用的服務

`sessions` 取活動狀態、`settingsScope` 取偏好、`slots` 取兩個座位、`locale` 取文案。

## Model Experience

無。此套件不註冊任何 tool、prompt、schema 或 context：它是視窗角落的一張圖，模型完全不知道它存在。

#### KV Cache effect

無。這裡不貢獻任何 prompt 片段、工具定義或 context 條目，因此不會移動任何重用邊界。

## 已知限制與未完成項目

- **只內建兩隻。** 上游的目錄大得多；每張圖約 1.7 MB，而且每一張都會隨安裝一起送出，所以「只有兩隻」是刻意的選擇，不是忘了整理的資料夾。要加一隻是放一個檔案，再加一筆 `src/pets.ts`。
- **沒有自主行為。** 上游的寵物會自己走動、睡覺、揮手；這裡的只映射 session。走動用的那兩列（`running-left`、`running-right`）每張圖都有，目前沒有東西驅動它們。
- **一次只看一個 session。** 寵物跟著目前的 session；背景 session 跑完一輪不會顯示在這裡。
