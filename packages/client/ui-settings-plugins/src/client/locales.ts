/**
 * Locale bundles for the cordis plugin area and its plugin cards.
 *
 * `title` names the deployment, not the product. This area sits on the
 * Plugins page under that page's own "Plugins" heading, and two headings
 * reading "Plugins" one above the other would say that the page is this
 * registry — which is the confusion the page was built to end.
 *
 * Vendor names in card copy name the SUPPLIER of a capability, never this
 * product. The web-search card is served by DeepSeek's search API and says
 * so; it is not "the DeepSeek search" of a rebranded desktop.
 */

/** Locale keys these surfaces render. */
export type PluginsSettingsLocaleKey =
  | 'title' | 'intro' | 'tabs' | 'configurableTab' | 'empty'
  | 'overridden' | 'reset' | 'readOnly' | 'expand' | 'collapse'
  | 'save' | 'saving' | 'discard' | 'unsaved' | 'saveFailed' | 'invalidNumber'
  | 'bashTitle' | 'bashDescription' | 'bashTimeoutMs' | 'bashTimeoutMsHint'
  | 'bashMaxOutputBytes' | 'bashMaxOutputBytesHint'
  | 'agentLoopTitle' | 'agentLoopDescription' | 'agentLoopMaxParallel' | 'agentLoopMaxParallelHint'
  | 'webSearchTitle' | 'webSearchDescription'
  | 'webSearchApiKey' | 'webSearchApiKeyHint' | 'webSearchApiKeySet' | 'webSearchApiKeyUnset'
  | 'webSearchBaseUrl' | 'webSearchBaseUrlHint' | 'webSearchMaxUses' | 'webSearchMaxUsesHint'

/** English copy. */
export const en: Record<PluginsSettingsLocaleKey, string> = {
  title: 'Deployment plugins',
  intro: 'Configure and inspect the plugins installed in this deployment.',
  tabs: 'Plugin views',
  configurableTab: 'Plugin configuration',
  empty: 'This deployment exposes no plugin settings.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  expand: 'Show settings',
  collapse: 'Hide settings',
  save: 'Save',
  saving: 'Saving…',
  discard: 'Discard',
  unsaved: 'Unsaved',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidNumber: 'Enter a number, or leave blank to use the default.',
  bashTitle: 'Shell',
  bashDescription: 'Limits every command the agent runs.',
  bashTimeoutMs: 'Command timeout (ms)',
  bashTimeoutMsHint: 'How long one command may run before it is terminated.',
  bashMaxOutputBytes: 'Output cap per stream (bytes)',
  bashMaxOutputBytesHint: 'Output beyond this spills to a temporary file rather than being lost.',
  agentLoopTitle: 'Agent loop',
  agentLoopDescription: 'How the agent dispatches tool calls.',
  agentLoopMaxParallel: 'Parallel tool calls',
  agentLoopMaxParallelHint: 'Upper bound on parallel-safe calls running at once within one step.',
  webSearchTitle: 'Web search',
  webSearchDescription: 'Web search for the agent, served by the DeepSeek search API.',
  webSearchApiKey: 'API key',
  webSearchApiKeyHint: 'Stored outside the settings file. Leave blank to keep the current key.',
  webSearchApiKeySet: 'A key is configured.',
  webSearchApiKeyUnset: 'No key is configured; search is unavailable until one is.',
  webSearchBaseUrl: 'Endpoint',
  webSearchBaseUrlHint: 'Leave blank to use the provider default.',
  webSearchMaxUses: 'Max searches per request',
  webSearchMaxUsesHint: 'How many times one request may search before it must answer.',
}

/** Simplified Chinese copy. */
export const zh: Record<PluginsSettingsLocaleKey, string> = {
  title: '部署插件',
  intro: '配置和查看本部署已安装的插件。',
  tabs: '插件视图',
  configurableTab: '插件配置',
  empty: '本部署没有开放任何插件设置。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  expand: '展开设置',
  collapse: '收起设置',
  save: '保存',
  saving: '保存中…',
  discard: '放弃修改',
  unsaved: '未保存',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidNumber: '请填数字；留空表示使用默认值。',
  bashTitle: '终端',
  bashDescription: '限制 agent 运行的每一条命令。',
  bashTimeoutMs: '命令超时（毫秒）',
  bashTimeoutMsHint: '单条命令允许运行多久，超时即终止。',
  bashMaxOutputBytes: '单流输出上限（字节）',
  bashMaxOutputBytesHint: '超出部分会转存到临时文件，而不是被丢弃。',
  agentLoopTitle: 'Agent 循环',
  agentLoopDescription: 'Agent 如何派发工具调用。',
  agentLoopMaxParallel: '并行工具调用数',
  agentLoopMaxParallelHint: '同一步内最多同时运行多少个可并行的调用。',
  webSearchTitle: '网页搜索',
  webSearchDescription: '为 Agent 提供的网页搜索，由 DeepSeek 搜索 API 提供服务。',
  webSearchApiKey: 'API Key',
  webSearchApiKeyHint: '不写入设置文件。留空表示保持当前密钥。',
  webSearchApiKeySet: '已配置密钥。',
  webSearchApiKeyUnset: '未配置密钥；配置之前搜索不可用。',
  webSearchBaseUrl: '接口地址',
  webSearchBaseUrlHint: '留空则使用提供方默认地址。',
  webSearchMaxUses: '单次请求最多搜索次数',
  webSearchMaxUsesHint: '一次请求在必须作答前最多可以搜索多少次。',
}

/** Traditional Chinese copy. */
export const zhTW: Record<PluginsSettingsLocaleKey, string> = {
  title: '部署外掛',
  intro: '設定與檢視本部署已安裝的外掛。',
  tabs: '外掛檢視',
  configurableTab: '外掛設定',
  empty: '本部署沒有開放任何外掛設定。',
  overridden: '已覆寫',
  reset: '還原預設',
  readOnly: '本部署的設定為唯讀。',
  expand: '展開設定',
  collapse: '收合設定',
  save: '儲存',
  saving: '儲存中…',
  discard: '捨棄修改',
  unsaved: '未儲存',
  saveFailed: '本部署沒有接受這些值，已保留供你修改。',
  invalidNumber: '請填數字；留空表示使用預設值。',
  bashTitle: '終端機',
  bashDescription: '限制 agent 執行的每一條指令。',
  bashTimeoutMs: '指令逾時（毫秒）',
  bashTimeoutMsHint: '單條指令允許執行多久，逾時即中止。',
  bashMaxOutputBytes: '單一串流輸出上限（位元組）',
  bashMaxOutputBytesHint: '超出的部分會轉存到暫存檔，而不是被丟棄。',
  agentLoopTitle: 'Agent 迴圈',
  agentLoopDescription: 'Agent 如何派送工具呼叫。',
  agentLoopMaxParallel: '並行工具呼叫數',
  agentLoopMaxParallelHint: '同一步內最多同時執行多少個可並行的呼叫。',
  webSearchTitle: '網頁搜尋',
  webSearchDescription: '為 Agent 提供的網頁搜尋，由 DeepSeek 搜尋 API 提供服務。',
  webSearchApiKey: 'API Key',
  webSearchApiKeyHint: '不會寫入設定檔。留空表示保持目前的金鑰。',
  webSearchApiKeySet: '已設定金鑰。',
  webSearchApiKeyUnset: '尚未設定金鑰；設定之前無法搜尋。',
  webSearchBaseUrl: '介面位址',
  webSearchBaseUrlHint: '留空則使用提供方的預設位址。',
  webSearchMaxUses: '單次請求最多搜尋次數',
  webSearchMaxUsesHint: '一次請求在必須作答前最多可以搜尋幾次。',
}

/** Japanese copy. */
export const ja: Record<PluginsSettingsLocaleKey, string> = {
  title: 'デプロイのプラグイン',
  intro: 'このデプロイにインストールされているプラグインを設定・確認します。',
  tabs: 'プラグインの表示',
  configurableTab: 'プラグイン設定',
  empty: 'このデプロイは設定可能なプラグインを公開していません。',
  overridden: '上書き済み',
  reset: '既定に戻す',
  readOnly: 'このデプロイの設定は読み取り専用です。',
  expand: '設定を展開',
  collapse: '設定を折りたたむ',
  save: '保存',
  saving: '保存中…',
  discard: '変更を破棄',
  unsaved: '未保存',
  saveFailed: 'このデプロイはこれらの値を受け付けませんでした。修正できるよう残してあります。',
  invalidNumber: '数値を入力してください。空欄は既定値を使います。',
  bashTitle: 'ターミナル',
  bashDescription: 'エージェントが実行するすべてのコマンドを制限します。',
  bashTimeoutMs: 'コマンドのタイムアウト（ミリ秒）',
  bashTimeoutMsHint: '1 つのコマンドを実行できる時間。超えると中断します。',
  bashMaxOutputBytes: '1 ストリームあたりの出力上限（バイト）',
  bashMaxOutputBytesHint: '超えた分は破棄せず一時ファイルに退避します。',
  agentLoopTitle: 'エージェントループ',
  agentLoopDescription: 'エージェントがツール呼び出しをどう割り振るか。',
  agentLoopMaxParallel: '並列ツール呼び出し数',
  agentLoopMaxParallelHint: '同じステップ内で同時に実行できる並列呼び出しの上限。',
  webSearchTitle: 'ウェブ検索',
  webSearchDescription: 'エージェント向けのウェブ検索。DeepSeek の検索 API が提供します。',
  webSearchApiKey: 'API Key',
  webSearchApiKeyHint: '設定ファイルには書き込みません。空欄なら現在のキーを保持します。',
  webSearchApiKeySet: 'キーは設定済みです。',
  webSearchApiKeyUnset: 'キーが未設定です。設定するまで検索は使えません。',
  webSearchBaseUrl: 'エンドポイント',
  webSearchBaseUrlHint: '空欄なら提供元の既定のアドレスを使います。',
  webSearchMaxUses: '1 リクエストあたりの最大検索回数',
  webSearchMaxUsesHint: '1 回のリクエストが回答する前に検索できる最大回数。',
}
