# Agent Note: the machine book reads the file ssh will open, not the one HOME names

Status: implemented

[English](2026-08-29-the-configuration-file-ssh-will-open.md) | 中文

## Problem

`SshHosts` 把預設設定檔解析成 `join(homedir(), '.ssh', 'config')`。`os.homedir()` 在 `$HOME` 有設的時候回傳它。**OpenSSH 不是**：它從密碼資料庫展開 `~`，並且忽略環境變數。

於是在任何 `HOME` 與 passwd 家目錄不同的行程裡——容器、`sudo`、某些桌面啟動器——這本機器簿從一個檔案列出機器，而連線讀的是另一個。使用者挑了一台明明看得見的機器，連線卻以

```
ssh: Could not resolve hostname testbox: Temporary failure in name resolution
```

失敗，因為對一個從未看過那個別名的客戶端來說，它從頭到尾就只是一個主機名。這個套件自己的 `Config` 文件早就寫著被打破的那條契約：一台機器在這裡可達，當且僅當它從使用者的終端機可達。

它是在對著一個拋棄式 sshd 重現另一件回報時浮現的，而那個 harness 是刻意用假 `HOME` 啟動的。那是一種真實的部署形狀，不只是測試產物。

## Decision

**預設值照 OpenSSH 自己的方式解析。** `sshUserHome()` 讀 `userInfo().homedir`，也就是 passwd 條目；只有在執行中的 uid 沒有條目時才退回 `os.homedir()`——而在那種情況下 OpenSSH 自己也是同樣的失敗方式，所以兩者仍然一致。

**指定路徑仍然同時操控兩半。** 在 `Config.configPath` 裡指名一個檔案，本來就會讓每一次調用都帶上 `-F`，所以清單與連線在那裡也不可能不一致。

**預設情況仍然不帶 `-F`。** `ssh -F <檔案>` 會抑制系統層級的 `/etc/ssh/ssh_config`，而在受管環境裡那個檔案帶著 `Match` 區塊與 `ProxyCommand`。把解析出來的路徑顯式傳進去，等於用「悄悄丟掉一個使用者終端機會讀的檔案」來換取兩半一致。

## Alternatives considered

**永遠帶著解析後的路徑傳 `-F`。** 最直覺的修法，而它是拿一種不一致換另一種：系統層級的檔案不再適用，於是一台從終端機經由組織 `ProxyCommand` 可達的機器，在這裡變成不可達。同一類失敗，症狀更安靜。

**讀取端維持 `homedir()`，把這個風險寫進文件。** 那個失敗訊息把一個不是 DNS 的問題講成 DNS 問題；讀到那句話的人不會去找設定檔路徑不一致。

**把 ssh 子行程的 `HOME` 設成 passwd 家目錄。** 什麼都不會改變——OpenSSH 在這件事上不看 `HOME`——而且會誤導下一個讀者以為它看。

## Consequences

在每一種部署形狀下，清單與連線都讀同一個檔案；而在 `HOME` 本來就等於 passwd 條目的地方——那是絕大多數——這個修正是看不見的。一個刻意把 `HOME` 指向可攜設定目錄的人，現在看到的是 OpenSSH 真正會用的那些機器，而不是他放在那裡的那些：這是誠實的答案，對那種設定而言也是行為改變。

`resolve()` 的失敗現在會一併帶上客戶端的結束碼與 stderr 的最後幾行，所以下一次同類的不一致會自己說出自己是什麼，而不是以一個解析錯誤的樣子抵達。

## Verification

這條規則由一個測試釘住：把 `HOME` 設成一個不是 passwd 家目錄的目錄，斷言機器簿仍然指向 passwd 家目錄下的那個檔案；把解析改回 `os.homedir()` 會讓它變紅。第二個案例釘住指定路徑會被原樣使用，並以 `-F` 抵達調用。

原始失敗是先在 app 之外重現的——`env -i HOME=<假的> ssh -T testbox` 解析不了那個別名，而同一個別名就在 `<假的>/.ssh/config` 裡——那正是把 passwd 規則指認為成因、而不是怪到 harness 頭上的依據。
