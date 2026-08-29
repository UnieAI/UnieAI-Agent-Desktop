# @unieai/uad-connector

[English](README.md) | 中文

這個 harness 被授予存取權的外部服務，以及用來連上其中一個的權杖。

## 它擁有什麼，又刻意不擁有什麼

三件事：有哪些連接器、其中一個有沒有連上，以及一個**此刻**有效的權杖。

它不擁有任何協定。跟人的對話屬於 [`authorization`](../../credentials/authorization/README.zh.md)；持久的授權屬於 [`credentials`](../../credentials/credentials/README.zh.md)，存成一則 `GrantRecord`；而一個連接器是**為了什麼**，屬於任何對著它註冊工具的東西。一個順便決定「該怎麼問人」的接縫，在每一種問法不同的介面上都得重寫一次。

**它不會打開瀏覽器。** 連線時它發出 `connectors/authorize` 事件並帶著 URL。要用瀏覽器顯示、用通知顯示、還是印在終端機上，是殼的答案；一個自己打開瀏覽器的接縫，在所有不是瀏覽器的地方都是錯的。

## 授權為什麼存在 `credentials` 裡

`modifyRecord` 是**跨行程**序列化的讀改寫，而它自己的文件就指名了這個情況：兩個行程同時輪替一個 refresh token，否則先寫的那個會消失，讓使用者在毫無說明的情況下斷線。refresh 整段跑在那個鎖裡面，而第二個同樣發現權杖過期的呼叫者，會看到第一個寫的結果，而不是再花掉一次 refresh token。

一個這個套件自己的儲存，得把那個性質重新掙來一次。

## 這個程式真正跑得動的那種授權

桌面 harness 沒有伺服器，所以收不到公開位址上的重導向；而那個曾經拿來頂替的「把這串碼貼過去」流程，Google 已經撤除、其他家也陸續棄用。剩下的就是 [RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252)：在 **loopback** 上綁一個臨時埠的監聽器，並把 `http://127.0.0.1` 註冊成重導向位址。埠由作業系統挑，所以 provider 必須接受任何 loopback 埠，而不是某一個固定號碼。

**永遠用 PKCE。** 原生應用留不住 client secret——它就裝在執行檔裡——所以交換改為綁定在這個行程自己產生的 verifier 上。這裡每一個連接器都是公開客戶端；沒有任何 secret 被儲存、讀取或送出。一個不接受 `S256` 的伺服器會被拒絕而不是降級，因為根本沒有東西可以降。

監聽器只回應一個請求、其餘一律拒絕，而且比對 `state` 時不讓時間差洩漏資訊：任何其他碰得到 loopback 的東西，都不該能結束一次進行中的嘗試。

## 兩種連接器，差別在於誰得先去註冊一個應用程式

**用 issuer 命名的。** provider 自己發布中繼資料（[RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414)），所以端點是讀來的而不是寫死的——伺服器才是自己位址的權威，而複製過來的 URL 會無聲地過期。這樣出貨的每一個也都公告了註冊端點，所以應用程式會在連線當下**自己註冊**（[RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591)），並宣告它已經在監聽的那個 loopback 重導向位址。**這些在全新安裝上就能用，不需要任何人的 client id。** Notion、Linear 與 Sanity 屬於這一種。

**把 URL 寫出來的。** 這些得先跟廠商註冊一個應用程式。它們仍然會被列出來，並在 client id 尚未設定時拒絕連線、說出缺的是什麼——把它們藏起來會看起來像這個連接器不存在。Google 與 Microsoft 屬於這一種，兩者都是使用 loopback 重導向的公開客戶端，所以都不需要 client **secret**。

由即時註冊取得的 client id 會**跟授權一起存**：它屬於那一次註冊，而用另一個 id 去 refresh 會被拒絕。

## Scope 是有價格的產品決策

Google 把 scope 分成 non-sensitive、sensitive 與 restricted，而一個 restricted scope 會讓發布者承諾一項每十二個月必須重做一次的第三方安全評估。這裡出貨的 scope 刻意都是不需要那個的：`drive.file` 只看得到使用者自己挑選、或這個程式建立的檔案，而身分 scope 讓兩個連線分得出是哪個帳號。

把那份清單放寬是一個有成本的決定，而它屬於擁有那個 OAuth 應用程式的人——這也是為什麼 scope 是 provider 條目的性質，而不是某一次安裝的性質。

## Model Experience

None，因為這個套件不註冊任何工具、提示、schema 或 context。它持有存取權；花用那份存取權的東西會註冊自己的工具，而那才是模型看得到的東西。

#### KV Cache effect

None。這裡沒有任何東西貢獻提示片段、工具定義或 context 條目，所以沒有任何重用邊界會因為它而移動。

## 已知限制與未完成項目

- **一個連接器只有一份授權。** 有兩個 Google 帳號的人只能連其中一個。要兩個的話，記錄的 key 得同時帶帳號與 provider，而且每一個呼叫者都得說清楚它指的是哪一個。
- **中斷連線只是本機的事。** 這裡移除了那筆紀錄；在使用者自己去 provider 那邊撤銷之前，授權仍然成立。說成別的樣子，會是一個這個程式守不住的承諾。
- **身分權杖是標籤，不是證明。** 讀 `id_token` 只為了顯示一個 email，而且不做驗證：它是經由 TLS、從這個流程剛剛呼叫過的 token 端點來的，而它所伴隨的存取權是由那個端點證明的。需要經過驗證的身分的呼叫者，得自己去驗。
- **沒有 API proxy。** 這個接縫交出一個權杖；每個服務的 base URL、分頁與重試策略都沒有被模型化，所以每個消費者自己寫呼叫。
- **只有 `authorization_code`。** client-credentials、device-code 與 API-key 型的連接器都很常見，而這裡一個都沒有；每一種都是描述子上多一個 `kind`，以及流程裡多一個分支。
