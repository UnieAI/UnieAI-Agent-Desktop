# Agent Note：由 host 開瀏覽器，而連不了的連接器要自己講出來

Status: implemented

[English](2026-08-30-the-host-opens-the-browser.md) | 中文

## 問題

連接器接縫能存下授權、也能發出 token，但沒有任何東西碰得到它。`ctx.connectors` 沒有被組進任何 composition，沒有 RPC 對外，而 `connect()` 把 `connectors/authorize` 發進一個沒有聽眾的 context —— 授權網址被產生出來然後丟掉，接著流程就坐在一個沒有人被帶去過的 redirect 上等。

有兩個決定是開放的，而兩個講的都是誠實，不是接線。

**誰去開瀏覽器。** 接縫刻意只發出網址而不自己開，因為一個會去開瀏覽器的接縫，在每一個「不是瀏覽器」的殼上都是錯的。但總得有人去開。

**對於這份建置連不了的連接器，人看到的是什麼。** Google 和 Microsoft 沒有發布註冊端點，所以它們需要先在廠商那裡註冊一個應用程式，以及一個在同意畫面上代表它的 client id。那個編號屬於營運這份建置的人，不可能在這裡一起出貨。在這個改動之前，要知道這件事的唯一辦法是按下「連接」然後讀失敗訊息。

## 決定

**由 host 開瀏覽器，因為那個 redirect 只有它到得了。** `host.connectConnector` 在一次嘗試的期間訂閱 `connectors/authorize`、過濾出自己正在連的那個連接器，並把網址交給 `openNativeUrl`。接縫維持與殼無關；而 API gateway —— 那個已經擁有 `openPath` 與 `canOpenPath` 能力的本機 GUI carrier —— 才是知道「這個部署有桌面」的那一方。

另一個候選是由 client 去開，在這裡是錯的：授權要結掉的是 host 手上握著的那個 promise、帶著網址的 frame 會遠遠晚於那個本來可以授權彈出視窗的點擊才到、而且在真正重要的那個瀏覽器裡，loopback listener 在 host 的機器上，不在觀看者的機器上。

有三條規則讓這次嘗試不會謊報自己的狀態：

- **沒有桌面的 host 在任何人開始等之前就拒絕。** `canOpenPaths()` 為 false 時立刻回 `connector-refused`，而不是靠一個永遠不會到達的 redirect。
- **開不起來的瀏覽器會結束這次嘗試。** 這條 route 用自己的 `AbortController` 跑接縫，並鏈接到呼叫端的那一個。`openNativeUrl` 被 reject 會 abort 它，而回報出去的訊息是開啟器自己的話 —— 不是它造成的那個 abort。
- **`openNativeUrl` 不是「拿 URL 去呼叫 `openNativePath`」。** 路徑開啟器會為了 Windows 桌面翻譯 WSL 路徑，那會把一個網址弄壞；而它到 Windows 的方式是 `Invoke-Item`，那開的是檔案不是網址。URL 開啟器用的是 `open`、`Start-Process`、以及 `$BROWSER`／`xdg-open`，而且只接受 `http` 與 `https`：那個網址來自服務自己的 metadata，而上面每一個指令都會把參數交給一個已註冊的處理程式 —— 在那裡一個 `file:` 網址會打開一份本機文件。

**連接器在任何人按下任何東西之前，就先講出自己到底連不連得了。** 當一個服務的端點是寫死的、不發布註冊端點、而且 `connectors.clientIds` 裡沒有它的編號時，`ConnectorStatus.requiresClientId` 為真 —— 這個判斷不碰網路，因為列出連接器不該取決於能不能連到每一個服務。用 issuer 指名的服務一律回 false：它的伺服器現在還提不提供註冊是一個網路事實，而這樣的服務若真的不提供，會在連接時用同一句話拒絕。

頁面於是把那個連接器列出來、標記它、把按鈕停用，並把註冊說明摺在一個 summary 後面。把它藏起來看起來就像這個連接器不存在，人就會去找它。

**wire 上帶的是名稱與狀態，永遠不會是 token。** `ConnectorView` 由一個逐欄位指名複製的函式建出來；access token、refresh token 與 client id 沒有任何路徑進得去。

### 這個 section 是一份列表，因為每個連接器要回答的都是同樣兩個問題

`@unieai/uad-client-ui-settings-connectors` 以 order 7 註冊進 `settings.section`。一個連接器一列 —— 標誌、名稱、一句話、一個控制項 —— 而不是一格格卡片後面各自藏著詳細頁：問題就是「連上了沒有」和「連的是誰」，兩個都放得進一行。

那句話是這樣挑的：頁面上不會出現「真的但沒用」的話。供應商沒有發 refresh token 的連接會顯示「有效期至 2026年9月30日，之後需要重新授權」，因為它是真的會結束的；寫到日期而不寫時刻，因為沒有人會照著 14:37 安排事情。

列表在開頁時讀取，不是持續監看。授權只會在有人按了這裡的按鈕、或到服務端撤銷時改變，而這兩件事 host 都不推播。

一次只跑一個授權，而清掉那個位置的是那次嘗試、不是那次點擊。兩個開著的視窗會爭同一個 loopback listener；而在按下取消的當下就放掉位置，會讓第二個授權在第一個還在收尾時就開始。

Google 和 Microsoft 依照廠商自己發布的樣子繪製；其他一律是一塊帶自己顏色的字母方塊。憑記憶把一個標誌畫得差不多，是看得出來畫錯的，而且那是對商標的誤用；而方塊對一個這個 fork 從沒聽過的連接器仍然是對的。

### web 測試套件卡住的兩件 scaffold 事實

兩件都早於這個改動，而且卡住的是 `apps/web/tests` 裡的每一個情境，不只新的那一個。

出貨的 Web 介面把每一頁都放在 UnieAI 登入閘門後面，它會在任何 client bundle 載入之前，把未登入的瀏覽器導去 `/auth/login`。沒有任何情境有帳號，也沒有任何情境是在測那道圍籬，所以 scaffold 停用那一列；閘門的覆蓋在它自己的套件裡。

首次啟動導覽會在 scaffold 剛剛建好的 home 上，蓋一個 modal 在所有東西上面，於是每個情境的第一次點擊都落在它的遮罩上。scaffold 用跟預先確認歡迎公告一樣的理由預先寫入 `first-run.seen`，而 `firstRunTourPending` 讓真正要測導覽的那個情境維持未看過。

## Alternatives considered

**由 client 去開授權頁。** 在 Electron 下 renderer 的 `window.open` 本來就會走到系統瀏覽器，而且不需要 host 端的開啟器。它在三件事上輸了：網址得以 host frame 的形式送過去，會晚於那個本來可以授權彈出視窗的使用者手勢才到；loopback listener 在 host 的機器上而不是觀看者的機器上；而人正在等的那個 promise 是 host 的。

**把沒有 client id 的連接器藏起來。** 列數更少，也不用解釋。但它讀起來就像這個連接器不存在，於是有人會去找一個他其實已經有的功能。

**讓「連接」失敗，然後顯示接縫的拒絕。** 那句拒絕正好指名了缺什麼，所以資訊沒有丟。但它是在一次只可能失敗的點擊之後才到 —— 而那正是這個 section 要消除的互動。

**用「探索每一個 issuer」來算 `requiresClientId`。** 對用 issuer 指名的服務會是精確的。但列出連接器就會取決於能不能連到全部的服務，於是一頁會因為某一台伺服器很慢而空白。

**拿 `openNativePath` 來開 URL。** 不用多一個函式。但它會翻譯 WSL 路徑，並用 `Invoke-Item` 開 Windows 目標，這兩件事對一個網址都是錯的。

**在單一情境的 overlay 裡停用登入閘門。** 這是這裡最早的修法形狀。它讓同一個目錄裡其他每一個情境，為了一個跟它們測的東西毫無關係的理由繼續紅著。

## Consequences

一次授權從頭到尾走得通：按下連接、使用者自己的瀏覽器在服務那裡打開、授權存下後那一列就更新。需要先註冊應用程式的連接器，會在人「讀」的地方說出來，而不是在人「按」的地方。

host 現在會開瀏覽器，這是 API gateway 原本沒有的能力。它被限制在一次嘗試一個網址、只有 http(s)、而且只在 `connectConnector` 執行期間。

在 scaffold 裡把登入閘門停掉，意味著 web 套件完全不再驗證那道閘門。這件事本來就已經成立 —— 每個情境都在登入頁上逾時 —— 而閘門有它自己套件的覆蓋；但受測的 composition 現在確實跟出貨的那一份差了那一列。

## Testing

接縫：三種服務形狀的 `requiresClientId`，以及填入或留空 client id 會不會改變它。

RPC domain，跑在一個組好的 host context 上：沒有連接器的部署會列出空的而不是壞掉、view 不帶任何 token、授權頁只為正在連的那個連接器打開（而不為同時發出的另一個）、拒絕開啟的開啟器會用它自己的訊息結束這次嘗試、呼叫端的 abort 會傳到接縫、以及沒有桌面的 host 會在等待之前就拒絕。把那個連接器過濾拿掉，第三項就會紅。

`openNativeUrl` 的每個平台，包含 WSL 直接走 Windows 桌面而不做路徑翻譯，以及對 http(s) 以外一切的拒絕。

section 與它的 store 在 jsdom 中達到單檔 100% 覆蓋：每個狀態的句子與控制項、一次一個授權的規則、取消，以及每一條 route 的拒絕。

`apps/web/tests/connector-settings.e2e.ts` 在真實瀏覽器裡驅動出貨的 Web composition：五個出貨的連接器都渲染出來、三個自行註冊的提供可按的「連接」，而 Google 與 Microsoft 被標記且停用。

## Deferred

`apps/web/tests` 其餘的部分因為早於這份工作、而且不是上面那兩件 scaffold 事實的理由而失敗 —— 光是 `settings-chrome`，在閘門與導覽都排除之後，於 HEAD 就有八個情境是紅的。那份漂移是它自己的改動。
