# @unieai/uad-ssh

[English](README.md) | 中文

一個人本來就連得到的機器，以及對每一台的共用連線。

## 為什麼用 `ssh` 客戶端，而不是 SSH 函式庫

一個打得出 `ssh build-box` 的開發者，早就把連線需要的一切寫下來了：前面的跳板機、要用哪把金鑰、非標準的埠、要不要轉發 agent、host key 檢查多嚴。那個檔案——`~/.ssh/config`——就是機器名冊，Rabi 不另外再存一份。

**讀得懂它，跟同意它，是兩回事。** `Host` pattern、`Match` 區塊、`Include` 檔案與命令列選項之間的互動順序由 OpenSSH 定義，而且它還會繼續擴充；今天寫得對的解析器，會在下一個版本開始分歧，而分歧會表現成「終端機連得到、但 Rabi 連不到的機器」。所以這個套件改成去問客戶端：`ssh -G <alias>` 會印出生效後的設定，而執行指令走的是同一個印出設定的執行檔。

驗證也一併解決了。agent 金鑰、硬體 token、`ProxyJump`、`known_hosts` 政策，以及其他所有憑證路徑都原封不動屬於 OpenSSH，Rabi 從頭到尾不持有任何需要保管的祕密。

## 它提供什麼

- **`list()`**——設定檔裡的 alias，會跟著 `Include`。pattern（`Host *`、`Host !prod`、`Host *.internal`）不列入：它們是用來設定連線的，不是用來指名一台機器。不做快取，所以執行中新增的機器立刻可選。
- **`resolve(alias)`**——這個 alias 實際代表什麼，來自 `ssh -G`。
- **`argvFor(alias, remoteCommand?, { tty })`**——adapter 要執行的客戶端引數。
- **`probe(alias)`**——機器有沒有回應，失敗時附上客戶端自己的訊息。能回答得出來全靠 `BatchMode`：否則一台要求 passphrase 的機器會停在沒有人看的提示前面。
- **`disconnect(alias)`**——關掉共用連線。

## 連線重用

每次呼叫都帶 `ControlMaster=auto`，所以第一個指令做完握手，後面的都接上去。對本機伺服器實測：200 ms，然後 7 ms。沒有它的話，每一次讀檔、每一個指令都要付一次完整金鑰交換，遠端工作區就會有那種感覺。

socket 放在 harness home 底下。OpenSSH 會把 `%C` 換成 40 個字元的摘要，而當實際綁定的路徑超過平台的 `sun_path` 上限（macOS 104 bytes、Linux 108 bytes）時，它拒絕的是**整條連線**，不只是連線重用。因此一個深到會溢位的 harness home，代價是失去連線重用，而不是失去那台機器；檢查量的是展開後的路徑，不是樣板。

## 遠端命令列

`ssh host <command>` 是把指令交給那個人的**登入 shell**，不管那是什麼。有三個細節是跟真實 shell 碰撞後留下來的：

- 用 `exec`，讓連線和指令之間不多站一個 wrapper 行程。
- 環境變數用賦值前綴（`A=b exec cmd`），絕不用 `env A=b -- cmd`：POSIX 的 `env` 只在賦值**之前**接受 `--`，否則會回 `'--': No such file or directory`。
- 指令前面也不放 `--`。`exec -- cmd` 是 bash 的擴充；dash 會回 `exec: --: not found`。`--` 本來要防的事情改成事前拒絕：以 `-` 開頭的指令名直接不送出。

工作目錄不存在時，指令會失敗（`exit 127`），而不是跑到登入目錄去執行——指定了目錄的呼叫端是認真的。

## Model Experience

無。此套件不註冊任何 tool、prompt、schema 或 context：它回答有哪些機器，並為真正做事的 adapter 組出連線引數。

#### KV Cache effect

無。這裡不貢獻任何 prompt 片段、工具定義或 context 條目，因此不會移動任何重用邊界。

## 已知限制與未完成項目

- **遠端登入 shell 必須是 POSIX 類。** 命令列用到 `cd`、賦值前綴與 `exec`，sh、bash、dash、ksh、zsh 的讀法都一致。登入 shell 是 csh 或 fish 的話需要另一套組法，而那還沒寫。
- **不會問 passphrase。** `probe()` 跑在 `BatchMode`，所以鎖住的金鑰會以 OpenSSH 的訊息回報為連不到，而不是跳出來要密碼。解鎖是 agent 的事，在 Rabi 之外。
- **列舉是淺的。** `list()` 讀的是 `Host` 行；只透過 `Match` 區塊才連得到的機器，或只在命令列上用主機名指定的機器，連得上但不會出現在清單裡。
- **`Include` 的萬用字元不展開。** `Include` 裡的字面路徑會跟進去，pattern 則跳過，所以 `~/.ssh/config.d/*.conf` 裡的 alias 不會出現在清單中，即使 `ssh` 找得到。
