# Agent Note: a connector is held access, and the seam owns no protocol

Status: implemented

[English](2026-08-29-a-connector-is-held-access.md) | 中文

## Problem

要碰到一個人的 Google Drive 或 Microsoft 帳號，需要三件這裡已經各自存在的東西——跟人的對話（`ctx.authorization`）、一個放它產出物的持久位置（`ctx.credentials`），以及某個會去花用它的東西——還有一件不存在的：一個叫做「這個 harness 有存取權的外部服務」的名詞，好讓介面能列出它們、連上其中一個、看見哪些連著。

顯而易見的做法在兩處是錯的。一個順便決定「該**怎麼**問人」的接縫，在每一種問法不同的介面上都得重寫一次。而一個會打開瀏覽器的接縫，在所有不是瀏覽器的地方都是錯的。

還有一個帶著價格的問題：那個 OAuth 應用程式是誰的？桌面程式留不住 client secret，而多數 provider 不會接受一個沒有人註冊過的應用程式送來的 loopback 重導向。

## Decision

**這個接縫只擁有三件事：有哪些連接器、其中一個有沒有連上，以及一個此刻有效的權杖。** 沒有別的。跟人的對話留在 `authorization`；持久的授權是 `credentials` 的一則 `GrantRecord`；而一個連接器是**為了什麼**，屬於任何對著它註冊工具的東西。

**連線時發出帶著 URL 的 `connectors/authorize`，而不是自己打開它。** 要用哪個介面顯示 URL——瀏覽器、聊天裡的通知、終端機裡的一行——是殼的答案。

**授權存在 `credentials` 裡，不是這個套件自己的儲存。** `modifyRecord` 是跨行程序列化的讀改寫，而它自己的文件就指名了這個情況：兩個行程同時輪替一個 refresh token，否則先寫的那個會消失，讓使用者在毫無說明的情況下斷線。refresh 整段跑在那個鎖裡面。一個私有的儲存得把那個性質重新掙來一次。

**永遠 loopback 加 PKCE。** 桌面 harness 沒有伺服器，而那個曾經頂替的「把這串碼貼過去」流程已經被 Google 撤除、其他家也在棄用；剩下的就是 RFC 8252 的 loopback 監聽器。埠由作業系統挑，所以 provider 必須接受任何 loopback 埠。PKCE 不是選配，因為根本沒有 secret 可以退回去用；而一個不接受 `S256` 的伺服器會被拒絕，不是降級。

**兩種 provider，差別在於誰得先去註冊一個應用程式。** 用 **issuer** 命名的 provider 自己發布端點（RFC 8414）——伺服器才是自己位址的權威，而複製過來的 URL 會無聲地過期。這樣出貨的每一個也都公告了註冊端點，所以應用程式會在連線當下自己註冊（RFC 7591），並宣告它已經在監聽的那個 loopback 重導向位址。**那些在全新安裝上就能用，不需要任何人的 client id。** 把 URL 寫出來的 provider 需要跟廠商註冊的應用程式；它仍然會被列出來，並在 client id 尚未設定時拒絕連線、說出缺的是什麼——因為把它藏起來會看起來像這個連接器不存在。

**Scope 是 provider 條目的性質，因為它有價格。** Google 把 scope 分成 non-sensitive、sensitive 與 restricted，而一個 restricted scope 會讓發布者承諾一項每十二個月重做一次的第三方安全評估。出貨的內容一個都沒要：`drive.file` 只看得到使用者自己挑選、或這個程式建立的檔案。把那份清單放寬，屬於擁有那個 OAuth 應用程式的人。

## Alternatives considered

**把 OAuth 流程放進 `authorization` 本身。** 那個接縫擁有對話，並刻意不擁有協定——它自己的文件就寫著：第二種協定是多一個 flow，不是多一個接縫。而且連接器需要的比一份憑證更多：狀態、scope，以及一個會自我更新的權杖。

**採用 Nango 的 provider registry。** 它是這個問題的參考實作，`providers.yaml` 涵蓋 982 個服務。它是 Elastic License 2.0——source-available，不是開源——所以把那個檔案出貨等於在產品裡放進帶著聲明義務的非 OSI 材料，而換來的是我們不需要的條目。改讀每個 provider 自己的 RFC 8414 文件，既在授權上乾淨，也更正確：伺服器才是權威，而複製來的清單會過期。

**替那些會自我註冊的 provider 也附一個 client id。** 沒有意義：它們會即時發一個，而預先註冊的 id 只是一個要維持同步、卻沒有好處的東西。

**強制要有 client id，沒有就不列出那個 provider。** 一個從清單裡消失的連接器，看起來就像一個不存在的連接器。列出來、然後指名拒絕，才是告訴人該做什麼的做法。

## Consequences

一個全新安裝可以在任何地方都沒有註冊的情況下連上 Notion、Linear 與 Sanity，因為那些 provider 會即時發放 client。Google 與 Microsoft 則等待出貨方註冊的應用程式——而且它會這樣說，而不是在 provider 那邊才失敗。

這個接縫只交出一個權杖：每個服務的 base URL、分頁與重試策略都沒有被模型化，所以每個消費者自己寫呼叫。目前這是刻意的；API proxy 是第二個設計，而這一個不該去猜它。

只有 `authorization_code` 存在。client-credentials、device-code 與 API-key 型的連接器都很常見，而這裡一個都沒有；每一種都是描述子上多一個 `kind`，以及流程裡多一個分支。

## Verification

二十四個測試，其中會無聲腐爛的那些經過變異檢查：拿掉 `S256` 的拒絕，或拿掉 Google 取得 refresh token 所需的兩個授權參數中的任一個，都會讓其中一個變紅。

三個會自我註冊的 provider 是對著它們自己的線上探索文件確認的——`mcp.notion.com`、`mcp.linear.app` 與 `mcp.sanity.io` 各自發布 `authorization`、`token` 與 `registration` 端點並公告支援 `S256`——而不是從第三方清單抄來的。
