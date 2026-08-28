# Agent Note：被 peer 裝進來的上游 harness 不是這個安裝的

Status: implemented

[English](2026-08-28-peer-installed-upstream-duplicates.md) | 中文

## 問題

0.1.13 上的 `bunx @unieai/rabi web` 在應用啟動之前就死了：

```
Error: dsh: /Users/…/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-runtime exists and is not a symlink;
       remove it so dsh can manage the installation fallback
    at ensureSymlink … at healProfilesModuleFallback
```

它拒絕碰的那個目錄，正是這段程式自己寫出來的：[上游名稱轉發器](2026-08-23-upstream-name-forwarders.zh.md)機制產生的 forwarder。變的不是它，是它底下的依賴閉包。

0.1.13 把 `@changfenhuang/dsh-genui` 放進了 web-app bundle。那個插件是對著上游 harness 發布的，所以它宣告了十三個 `@deepseek-ai/*` peer dependency。**npm 7+ 與 bun 都會自動安裝缺少的 peer。** 於是安裝這個產品會連帶下載一整份完整的上游 harness —— `@deepseek-ai/cordis`、`dsh-agent`、`dsh-api-gateway` 等等 —— 就擺在我們自己那份旁邊。

`healProfilesModuleFallback` 建立扁平 fallback 時會走訪 `dependencies` 與 `peerDependencies`，所以那些套件進了閉包。接著它試圖在上一次啟動為 `@unieai/uad-client-runtime` 寫下 forwarder 的那個路徑上，改建 `@deepseek-ai/dsh-client-runtime` 的連結，於是整個開機停住。

當機只是看得見的那一半。看不見的那一半更糟：如果那個路徑當時是空的，連結就會建成，插件會解析到一個它從來沒有被載入其中的 harness 的 `Context` 類別與服務註冊表。跨這兩份的 `instanceof` 會失敗、任何服務都拿不到 —— 正是 forwarder 存在要防止的那個失敗，而且是無聲地發生，不是大聲地。

## 決定

**是誰刻意要的，決定一個上游名稱屬於哪個套件；而「刻意」記錄在 app 的 manifest 裡。**

`healProfilesModuleFallback` 會在三個條件同時成立時把某個閉包項目丟掉：這個名稱是本產品改名所涵蓋的上游名稱（`productNameFor` 解得出來）、它對應到的產品套件本身也在閉包裡、而且 app manifest 沒有直接宣告那個上游名稱。接著 forwarder 就會像那份重複品出現之前一樣拿下這個名字。

這三個條件每一個都在承重：

- **沒有對應產品套件的名稱不動它。** 一個這個 fork 從來沒有改名過的上游套件是真的依賴，不是我們的重複品；丟掉它會弄壞那個要求它的安裝。
- **app 自己宣告的名稱不動它。** 有人把 `@deepseek-ai/dsh-tools` 跟我們的裝在一起，那是他選的，它保留自己的名字 —— 這條規則從 forwarder 上線起就被 `profile.spec.ts` 釘住了。而出現在依賴圖更深處的東西，是套件管理器為了滿足別人的 peer 範圍而選的，不是這個安裝選的。
- **對應的產品套件必須在場。** 不在場的話，forwarder 沒有東西可以轉發，那份上游副本就是唯一的來源。

**這段程式自己產生的 forwarder 可以被取代，其他任何東西都不行。** `ensureSymlink` 現在會移除帶有 `dshLegacyForwarder` 標記的目錄並改寫連結，而對沒有標記的目錄照樣拋錯。這個標記本來就是為了鏡像的另一半而存在的 —— `ensureLegacyForwarder` 拒絕覆蓋一個已安裝的套件 —— 所以兩個方向現在從同一個事實讀出同一條規則。這段程式自己寫下的目錄，絕不該變成一個只有拿得到 shell 的人才能清掉的永久阻斷；碰到它的人什麼也沒做錯。

後面這一半是安全網，不是修法本身。有了閉包過濾之後，本產品擁有的名稱不會再發生這個碰撞，但它造成的狀態已經在真實機器上，而升級到新版的安裝必須能自己把它治好。

## 考慮過的其他做法

**讓已安裝的上游套件勝出，丟掉 forwarder。** 這就是原本的規則，也是這次當機的來源。當那個套件是人裝的，它是對的；當它是套件管理器裝的，它是錯的 —— 而在建立連結的那一步，沒有任何資訊能分辨這兩者。這正是為什麼判斷被移到 app manifest：差別記錄在那裡。

**在閉包走訪時直接跳過所有上游名稱。** 比較簡單，然後無聲地弄壞刻意的那種情況：一個真的依賴上游套件的安裝，會發現那個名字被指向另一個套件的 forwarder 接走了。

**不要讓 `peerDependencies` 進入閉包。** 它們在那裡是有原因的，而且記在 `healProfilesModuleFallback` 裡：樹外插件要拿到 Service Definition 套件（`dsh-compaction`、`dsh-invariants`），只能透過實作它們的 provider 的 peer 邊。砍掉這條邊，等於讓整套機制要服務的那些插件解析不到。

**把那個插件 vendor 進來，或從 bundle 裡拿掉。** 這兩種做法會同時消掉重複下載和這次的碰撞，而且都還開著：安裝仍然是肥的，因為那些 peer 不管有沒有東西連結它們都會被裝。那是關於某一個依賴的封裝決定，不是解析規則，所以這裡把它記成未完成，而不是當成已回答。

## 驗證

`profile.spec.ts` 涵蓋了失敗的那個形狀以及它周圍的每一條邊界：被 peer 裝進來的重複品留給 forwarder、沒有對應套件的上游名稱照樣連結、閉包真的認領某個名稱時取代自己產生的 forwarder、以及那個路徑上已安裝的套件照樣被拒絕且內容完好。把修法的任何一半拿掉，都會有一個變紅。

## 這件事還留下什麼

安裝這個產品仍然會下載一整份沒有任何東西會載入的上游 harness。現在沒有東西會解析到它，但每個使用者還是付了那份下載和磁碟空間。答案是一個關於 `@changfenhuang/dsh-genui` 的封裝決定 —— vendor 它、fork 它的 manifest、或從預設 bundle 拿掉 —— 而那不在這裡決定。
