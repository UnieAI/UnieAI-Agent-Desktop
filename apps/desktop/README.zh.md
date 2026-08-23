# @unieai/uad-desktop

[English](README.md) | 中文

一個 Electron 視窗，罩在這個 app 自己啟動並持有的 harness 上。它是「可安裝的應用程式」形態的 UnieAI Agent，而不是瀏覽器裡的一個網址。

## 為什麼要有它

網頁 GUI 本身就已經是產品了。桌面版加上的不是功能，而是觸及：一個人可以安裝、放在 dock 裡、不用記指令和連接埠就能啟動的東西。

所以這個套件刻意不放任何產品行為。它啟動 `dsh web`，等那個伺服器回報位址，然後載入。之後一個人做的每一件事，都是這個 repo 其他部分已經測過的同一份程式碼——一個長出自己功能的外殼，會變成第二個沒有任何東西撐著的產品。

## 它怎麼啟動 harness

三個選擇撐起了大部分的設計。

**就緒訊號是網址那一行，不是計時器。** `dsh web` 只有在 Loader 安定之後才會印出 `dsh web: http://127.0.0.1:<port>`，而 [`packages/bundle/web-app`](../../packages/bundle/web-app/README.zh.md) 明確把那一行記載為 supervisor 等待的訊號。一個改用「睡一下再賭賭看」的外殼，在慢的機器上會顯示錯誤頁，在壞掉的機器上會顯示空白視窗。

**連接埠由作業系統決定。** `--port 0` 會綁一個臨時的 loopback 連接埠，網址那一行則回報實際取得的那個。固定連接埠會跟已經在跑 `dsh web` 的開發者相撞；在這裡隨機挑一個數字，只是把撞號移到更不容易看見的地方。

**家目錄是這個 app 自己的。** `DSH_HOME` 指向打包後 app 自己的資料目錄，所以安裝的版本和開發用的 checkout 永遠不會寫進對方的 profile、憑證或工作階段。

harness 跑在 Electron 的 utility process 裡——那是 Electron 本來就帶著的 Node 環境。打包後的 app 沒有另一個 `node` 執行檔可以 spawn。

關於那個環境有兩件事並不顯而易見，而且兩件都花了很久才查出來：

**Electron 的 Node 以「保留符號連結」的語意解析模組，而 pnpm 的 `node_modules` 整個建立在符號連結上。** 所以對著 workspace 那棵樹啟動的外殼找不到 harness 的外掛，它會說 `Cannot find package '@unieai/cordis-plugin-timer'`。這是用排除法證明的：系統 `node` 跑同一個進入點會印出網址；`ELECTRON_RUN_AS_NODE=1` 用 Electron 自己的 Node 跑會一模一樣地失敗，這排除了 utility process；而系統 `node --preserve-symlinks` 完全重現。npm 裝出來的樹——真實目錄、沒有符號連結——解析得乾乾淨淨，這也是為什麼打包是用安裝而不是連結。

**`--expose-internals` 是刻意傳給 harness 的。** harness 透過 Cordis HMR 監看使用者自己的 patch 層，而 HMR 需要 Node 的內部模組載入器。`vendor/loader` 有兩條路可以拿到它：這個旗標，或是 `node-addon-require-builtin` 這顆原生模組。那顆模組是對著 Node 的 ABI 建的，在 Electron 裡載不起來，所以少了旗標兩條路都斷——而且失敗發生在網址那一行**之後**，因為伺服器先綁好了，行程才以 1 結束。這個旗標是那個函式裡記載的第一條路，不是繞過它。

## 失敗會被顯示出來

否則一個起不來的 harness 只會留下空白視窗，而且無從得知原因。這個視窗會把 harness 停止之前寫出來的內容渲染出來，而且用 data URL 而不是打包好的頁面：一個自己還得從某處載入的錯誤頁，等於在什麼都不能運作的那一刻，多一個可能失敗的東西。

## 怎麼跑

```sh
pnpm --filter @unieai/uad-desktop run start
```

必須先在 repo 根目錄跑過 `pnpm run build`：外殼打包和啟動的是 harness 建置後的 `lib/`，不是它的原始碼。

## 打包

```sh
pnpm --filter @unieai/uad-desktop run package:mac:arm64   # on an Apple Silicon Mac
pnpm --filter @unieai/uad-desktop run package:mac:x64     # on an Intel Mac
pnpm --filter @unieai/uad-desktop run package:win:x64     # on Windows x64
pnpm --filter @unieai/uad-desktop run package:win:arm64   # on Windows arm64
```

**每個目標都必須在該平台上打包**，`scripts/verify-target.mjs` 會拒絕其他情況。這是被打包物本身的性質，不是保守：封閉集裡帶著套件管理器在安裝時依平台與架構挑選的原生二進位檔——`koffi`，也就是 Win32 沙箱的 FFI，是最清楚的例子——所以在 Linux 上產出的 macOS 版，會把 Linux 的二進位檔包進 `.dmg`，而且只有在有人執行時才會失敗。四個目標就是四台機器，或是 [`desktop-release.yml`](../../.github/workflows/desktop-release.yml) 裡的四個 runner。

## 更新

app 啟動時會檢查 GitHub Releases 的來源。讓它能運作的不是 tag：`electron-updater` 讀的是 electron-builder **在發佈時**才會寫出的 `latest.yml` 和 `latest-mac.yml`，這也是為什麼 workflow 傳 `--publish always` 而本機腳本傳 `--publish never`。macOS 另外是從 `zip` 目標更新，而不是 `.dmg`，所以一份只帶磁碟映像的 release，只能讓人手動安裝，沒有東西可以更新。

**Windows 會自己安裝更新，macOS 只會告知並開啟下載頁。** 這個分歧不是偏好：Electron 的文件明載，在 macOS 上應用程式必須經過簽章才能自動更新，因為 Squirrel.Mac 要求如此。一份未簽章卻承諾會安裝的版本，會在下載完成之後才失敗，那比不提供更糟。`src/updates.ts` 明確寫出了有了 Developer ID 之後該刪掉什麼。

未簽章另外的代價是安裝時的警告——Windows 上是 SmartScreen，macOS 上則要繞一趟「系統設定 → 隱私權與安全性」，因為右鍵開啟的繞法在 Sequoia 被移除了。

## Model Experience

無。這個套件提供的是應用程式外殼；這裡沒有任何東西會到達模型請求，也沒有註冊任何提示詞、工具或訊息。

#### KV Cache effect

無；這個套件不組裝也不送出任何東西。

## Known Limitations and Deferred Work

- **macOS 版無法自我更新**，原因如上。唯一的解法是 Apple Developer ID，這個套件裡沒有任何東西可以替代它。
- **沒有 Linux 目標。** 視窗在那裡可以運作，harness 也是在那裡開發的，但沒有人要求過可安裝的 Linux 版，而要加就得在 AppImage、deb 和 Flatpak 之間選一個，這個套件手上沒有足以做這個選擇的依據。
- **Windows arm64 有打包但沒測過。** 每一個相依都發佈了 arm64 的二進位檔，這是這個目標存在的原因；但沒有任何一台 arm64 的 Windows 機器跑過產出的結果。
- **這個外殼沒有測試。** 它的兩個接縫——網址那一行和 utility process——都是無法在 `vitest` 下執行的 Electron API，而替兩者都做測試替身，等於在斷言這個套件自己的 mock。真正保護這個約定的，是網址那一行在它被產生的地方有記載也有測試。
