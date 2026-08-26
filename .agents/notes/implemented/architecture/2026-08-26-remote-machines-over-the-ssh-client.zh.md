# Agent Note: 透過使用者自己的 `ssh` 客戶端連到遠端機器

Status: implemented

[English](2026-08-26-remote-machines-over-the-ssh-client.md) | 中文

## Problem

Rabi 只跑在它被安裝的那台機器上。一個人的工作如果在編譯機、GPU 機或公司伺服器上，harness 就只能指向本機的 checkout，而那台有工具鏈、有資料、有 GPU 的機器待在 `ssh` 後面——電腦上每一個終端機都連得到，唯獨這裡連不到。

[可攜執行世界的決策](2026-07-28-portable-execution-world-consumers.zh.md)已經確立：`ctx.fs` 與 `ctx.subprocess` 合起來定義一個執行世界，而 Bash、常駐終端機、language server 與檔案工具消費的是這兩個介面，不指名 provider。E2B 的實作已經在一個遠端 Linux sandbox 上驗證過。它沒有回答的是：怎麼連到一台**已經存在**、而且使用者**已經有憑證**的機器——一台存取規則寫在 `~/.ssh/config` 裡，由 SSH agent、硬體 token、跳板機或公司 CA 執行的機器。

用 SSH 協定函式庫去連這種機器，等於重新實作那個檔案的語意。`Host` pattern、`Match` 區塊、`Include` 檔案、`ProxyJump`、`IdentityAgent`、`known_hosts` 政策與各主機的覆寫規則，彼此的互動順序由 OpenSSH 定義，而且還在持續擴充。今天與那個檔案一致的實作，會在下一個版本開始分歧，而分歧會表現成「終端機連得到、Rabi 連不到的機器」——而且使用者無從判斷是哪一邊錯了。

## Decision

底層就是電腦上本來就有的 `ssh` 客戶端。`packages/ssh/ssh`（`ctx.ssh`）只掌握三件事：

- **有哪些機器。** 從使用者自己的 OpenSSH 設定讀出來，會跟著 `Include`。pattern（`Host *`、`Host !prod`、`Host *.internal`）排除在外：它們是用來設定連線的，不是指名一台機器。不做快取，所以執行中新增的機器立刻可選。
- **一個 alias 代表什麼。** `ssh -G <alias>` 會印出「一條尚未建立的連線」的生效設定，所有 pattern、區塊與預設值都已套用。讀它的輸出，是唯一能與「真正要去連線的那個客戶端」保持一致的方法。
- **每台機器一條連線。** 每次呼叫都帶 `ControlMaster=auto`，第一個指令做金鑰交換，其餘的接上去。對本機伺服器實測：200 ms，然後 7 ms。沒有連線重用的話，每一次讀檔都要付一次握手，遠端工作區就會有那種感覺。

因此驗證從來不是 Rabi 的事。agent 金鑰、硬體 token、跳板機與 host key 政策都留在 OpenSSH，這個 repository 不儲存、不詢問、也不轉發任何祕密。

遠端機器上不安裝任何東西。一套遠端開發伺服器會是第二個要版本控管、要部署、要與客戶端維持相容的產物；而上面那兩個接縫只需要一個 shell 和一個檔案系統，`sshd` 本來就提供了。

### 遠端命令列

`ssh host <command>` 是把一個字串交給那個人的**登入 shell**，不管那是什麼。有三個細節是跟真實 shell 碰撞後留下來的，每一個都有一個測試釘住，並在測試裡寫明是哪個 shell 教的：

- **用 `exec`**，讓連線與指令之間不多站一個 wrapper 行程。否則送給連線的訊號會打在 wrapper 上，指令繼續活著。
- **環境變數用賦值前綴**（`A=b exec cmd`），絕不用 `env A=b -- cmd`。POSIX 的 `env` 只在賦值**之前**接受 `--`；標準的 `env` 會回 `'--': No such file or directory`，指令根本不會執行。
- **指令前面也不放 `--`。** `exec -- cmd` 是 bash 的擴充；dash 會回 `exec: --: not found`。`--` 原本要防的事情改在組字串時拒絕：以 `-` 開頭的指令名直接不送出。

工作目錄不存在時，指令以 `exit 127` 失敗，而不是跑到登入目錄執行——指定了目錄的呼叫端是認真的。

### 控制通道 socket

連線重用的 socket 放在 harness home 底下。OpenSSH 會把 `%C` 換成 40 個字元的摘要，而當實際綁定的路徑超過平台的 `sun_path` 上限（macOS 104 bytes、Linux 108 bytes）時，它拒絕的是**整條連線**，不只是連線重用。因此防護檢查量的是展開後的路徑，不是樣板；深到會溢位的 harness home，代價是失去連線重用，而不是失去那台機器。

## Alternatives considered

**用 SSH 協定函式庫（`ssh2`）。** 否決，因為機器名冊就是 `~/.ssh/config`，而只有 OpenSSH 定義它的語意。函式庫會擁有一個不斷長大的表面——pattern 比對、`Match` 求值、`ProxyJump` 串接、agent 與 token 協定、`known_hosts` 政策——而它唯一的正確性標準，是與一個機器上早就裝好的程式保持一致。它還會讓 Rabi 變成憑證持有者，而一個會儲存 SSH 祕密的桌面應用，等於背上一個它無法處理的威脅模型。

**解析 `~/.ssh/config` 來決定連線。** 基於同樣的理由否決，只是規模小一點：列舉是一個由使用者點選確認的提示，但解析決定的是指令在哪裡執行。`ssh -G` 是客戶端自己的答案，不可能與客戶端不一致。

**由 Rabi 自己維護一份機器清單。** 否決，因為那是第二個要維持正確的地方。一個打得出 `ssh build-box` 的開發者早就記錄過埠號、金鑰、跳板機與 agent 政策；要他們再寫一次、而且每次變更都再寫一次，正是兩份清單開始互相矛盾的方式。

**在遠端機器上安裝 helper。** 否決；那是部署模型的選擇，不是功能。接縫只需要一個 shell 和一個檔案系統；常駐伺服器會替每一台連線的機器加上版本、升級與相容性義務，換來的能力這個決策並不需要。

**像 E2B POC 那樣，整個行程一個遠端世界。** 不是否決，而是尚不足夠：那正是這個套件今天支援的形態。要在每個 workspace 選一台機器，需要把呼叫路由到「由呼叫端 session 決定的目標」，`ctx.agents.currentInitiator()` 讓這件事可行，但這裡還沒有任何程式碼做它——因此列在 Deferred，而不是靠組合方式暗示。

## Testing

四組不依賴外部環境的測試釘住底層規則：alias 列舉（含 `Include` 與其循環）、`ssh -G` 的讀取、遠端命令列的三個 shell 教訓，以及連線選項與控制路徑的長度量測。

`subprocess-ssh` 有自己的一組：pid 檔命令列與各項拒絕的純測試、指令與查找與「終止一棵忽略 HUP 的遠端行程樹」的實機測試，以及一組組合測試——讓完全不知道 SSH 存在的 `dsh-bash-local` 跑在遠端接縫上，並對執行器自己的結果做斷言。

一組有條件執行的測試（`tests/live-connection.e2e.ts`）用同一份程式碼對真實 `sshd` 執行：解析、可達性與其失敗訊息、連線重用（斷言的是 master 是否存在，因為比較耗時的測試偏偏會在機器忙碌時失敗）、離開狀態的傳遞、兩條輸出串流的分離、帶單引號的環境變數、存在與不存在的工作目錄，以及多位元組輸出。沒有 `DSH_SSH_TEST_CONFIG` 與 `DSH_SSH_TEST_ALIAS` 時它回報自己被略過，而不是空洞地通過；檔案本身寫明它期待的那台用完即丟的伺服器怎麼架。

## Deferred

- **檔案系統 adapter。** `fs-ssh` 才是把讀檔、寫檔、編輯與搜尋放到那台機器上的套件；`subprocess-ssh` 隨這份 note 一起交付，負責把所有指令放上去。
- **機器上的終端機。** `subprocess-ssh.spawnTerminal` 選擇拒絕而不是配置一個本機終端機，因為本機 PTY 的前景行程永遠是 `ssh`，提示符與閒置偵測會把它誤讀成那個 shell。缺的是遠端前景行程的檢視。
- **每個 workspace 選一台機器。** 服務以 alias 建立連線池，因此可以同時有多台機器在線，但目前還沒有東西把呼叫路由到其中一台。`ctx.agents.currentInitiator()` 是路由器會讀的那個環境事實。
- **不是 POSIX 類的登入 shell。** csh 與 fish 各自需要自己的遠端命令列組法。

## Consequences

Rabi 連得到使用者本來就連得到的每一台機器，用的是他們已經寫下的存取規則，而且為此不需要持有任何憑證。代價是：依賴機器上裝有 `ssh` 客戶端、依賴遠端登入 shell 是 POSIX 類，以及接受 OpenSSH 的行為——包含它的錯誤訊息——就是機器不回應時使用者會看到的東西。
