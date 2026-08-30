# Agent Note：preset 可以擁有一個會畫東西的外掛

Status: implemented

[English](2026-08-30-a-preset-may-own-a-plugin-that-draws.md) | 中文

## 問題

`genui`、`univer-office` 和 `tool-page-capture` 掛在 HOST 組合裡，而這三個都註冊模型看得到的工具。host 的一列會註冊進程序層級的全域目錄，每個 agent 都繼承 —— 所以定義上就是 `bash` 加 `str_replace_editor` 兩個工具的 `minimal` preset，多背了十七個。每個 preset 的每一次請求都在付那些 schema 的錢，而一個 `minimal` session 可以呼叫它定義上排除掉的 Office 工具。

它們違反的規則就寫在 `standard/agent.cordis.yml` 自己的檔頭：host 組合持有註冊表、沙箱與核准堆疊、持久化和模型路由；preset 持有「一個 session 加上去的東西」。`shipped-composition` 直接斷言這件事 —— 不指定 agent 的 `ctx.tools.schemas()` 必須是空的 —— 而它讀到十六個。

**光是搬過去不夠**，而這才是有意思的地方。這三個都是雙面套件：`genui` 畫面板，`univer-office` 畫文件檢視器。瀏覽器的外掛 bundle 來自 `window.__DSH_BOOT__`，那是開頁時組一次的，來源是 **Loader** 當下有 entry 的那些套件。而一個 preset 的 standing composition 是 `ensureStanding` 在第一個 agent 加入時才建的 —— 那已經是開頁之後。照原樣搬，兩個套件會整個離開 boot graph：實測，搬之前 56 個 entry，搬之後 54 個，而且兩個都不在裡面。工具還是跑得動，但什麼都不會被畫出來。

## 決定

**roster 把它旗下 preset 的套件宣告給 client module registry，而 registry 會為「沒有任何 Loader entry 指名」的套件提供瀏覽器半邊。**

`ClientModuleRegistry.declare(names)` 在 entry 掃描之外加上第二個來源。`processOne` 本來就在問「這個名字合格嗎」；被宣告過的名字不需要 entry 就合格，而下游的一切 —— metadata 解析、bundle 路由、boot graph —— 都不用改。它是一個 effect：disposer 會把名字收回去。

供應者是 `AgentPresetRoster`。它知道每個 preset 的組合檔路徑，而 `compositionPluginNames` 用 Loader 自己的 YAML 方言去讀 —— 跟 `compositionProblem` 為健康檢查做的是同一種解析 —— 並走訪 `config` 陣列，好讓 group 的成員也被找到。registry 會把每個名字對套件圖解析，並把不是套件的那些（`cordis:group`、子路徑列）快取成否定結論，這跟它對 host 列本來就在做的事一樣。

相依方向是 roster → registry，而這是對的：知道「某個套件會以 per-session 方式掛載」的那一方，去告訴「負責提供瀏覽器半邊」的那一方。注入是選配的 —— 沒有瀏覽器介面的組合不會掛 registry，roster 就什麼都不宣告。

**`page_screenshot` 也一起搬。** 它是這個 fork 自己的套件，而且是模型看得到的工具，所以同一條規則把它放進 preset。另外兩個搬走之後，它是全域層裡剩下的最後一個。

## 這件事在那三個套件之外買到了什麼

一個同時帶工具和介面的外掛，現在可以屬於某個 preset。在這之前，這種外掛必須待在 host 組合裡才畫得出東西，而它的工具就會不分 preset 地到達每個 agent —— 所以「這個 preset 有哪些外掛」和「哪些外掛畫得出東西」是同一個問題，而且答案是 host 層級的。現在它們分開了，而那正是一個 plugin 系統需要的邊界。

## Alternatives considered

**開機就急切掛載預設 preset。** 這樣頁面組 graph 時 standing composition 就存在了，registry 完全不用改。但它會讓 preset 的所有外掛在沒有任何 session 時就活著，在一個冷啟動本來就被抱怨的介面上再加啟動時間，而且只回答了**預設**那個 preset —— 指名別的 preset 的 session 又回到原點。

**留在 host 組合，放寬斷言。** diff 最小，而且會把這個 regression 寫進基準：`minimal` 不再是 minimal，而下一個帶工具的外掛會繼承同一個洞，還配上一個說「這樣沒問題」的測試。

**讓 registry 自己去讀 preset 組合檔。** 它會需要 roster 的根目錄、優先順序規則和使用者目錄解析 —— 而這些都屬於 roster。宣告是比較小的接縫，而且它也涵蓋 roster 用其他方式得知的 preset。

## Consequences

`minimal` 又是兩個工具了，全域目錄是空的，而 `standard` 帶著它本來實際上就有的那十七個 —— `shipped-composition` 的名單長出來的，正好就是那些名字，也就是一個 `standard` session 一直以來看到的同一份目錄。

registry 現在有兩個套件名來源，不是一個。一個被宣告卻從未被掛載的名字仍然會提供 bundle，在用不到它的頁面上多一次抓取；roster 只宣告自己 preset 指名的套件，所以這個集合被出貨的組合檔所限。

無頭的 host 現在也會帶著 node 半邊。`python/sdk-runtime` —— Python SDK 背後那個單檔執行檔 —— 載的是同一批出貨 preset，所以 `verify-runtime-closure` 要求每個 preset 外掛都出現在它的相依清單裡；把這三個搬進 `standard`，就是它們出現在那裡的原因。這是對的：那個 exe 可以呼叫 `panel` 工具，它只是沒有地方把它畫出來。exe 不需要的是 genui 的瀏覽器半邊，所以 genui 那六個 `@unieai/uad-client-*` peer 現在是 `optional` —— 它的 node 進入點只用 type-only 匯入它們，而會畫東西的 host 自己提供，這跟 `app-boot` 對 `cordis-plugin-hmr` 用的是同一個形狀。`page-capture` 是相反的情況，而且讀起來就是相反：`@unieai/uad-browser-operator` 是它 node 半邊真正的匯入，所以它進入 closure，而不是被放行。

## Testing

`packages/client/modules` 與 `packages/preset/agent-presets` 兩個套件的測試，183 個。

在真實瀏覽器中對著出貨的 Web composition：搬完之後兩個套件都在 `window.__DSH_BOOT__` 裡（56 個 entry，`@unieai/genui` 和 `@unieai/univer-office` 都在) —— 這正是能抓到「天真搬法」的那個檢查，那個搬法得到的是 54 個而且兩個都不在。

`minimal-preset.snapshot` 把 RL 請求的工具清單釘在 `bash` 和 `str_replace_editor`。`shipped-composition` 釘住空的全域層和 `standard` 的名單。
