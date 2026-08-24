/**
 * Copy for the plugin directory.
 *
 * Where the UnieAI Copilot web product publishes an equivalent string, it is
 * copied VERBATIM from `messages/{en,zh-cn,zh-tw,ja}.json` and the source
 * namespace and key are named beside the line. The desktop's Plugins page is
 * this product's plugin destination and the reference product has one of its
 * own; a paraphrase would make the two look like different features.
 *
 * THREE DEVIATIONS, ALL DELIBERATE:
 *   - `enabledTag`/`disabledTag` in zh-CN keep this package's own shipped
 *     pair (`已启用`/`已停用`) rather than the reference's
 *     `SettingsSubscription.enabled`/`.disabled`, whose zh-cn values are
 *     written in TRADITIONAL characters (`啟用`/`停用`) — a defect in that
 *     file, not a translation. zh-TW carries the traditional form of this
 *     package's pair for the same reason. en and ja are verbatim.
 *   - The Loader lifecycle labels (`unobserved` … `unloading`) name Cordis
 *     Fiber states. The reference product has no Loader and no equivalent
 *     copy, so all four locales are this package's own words, unchanged from
 *     what it already shipped in en and zh-CN.
 *   - `intro` and `note` are this package's own. `note` names the command
 *     that actually installs a plugin, because this surface has no install
 *     control and must not grow one that cannot act: the honest replacement
 *     for a dead button is the sentence saying where the action lives, which
 *     is the same thing the Studio MCP area above it does.
 *
 * All four shipped locales carry a complete dictionary, so nothing here falls
 * back to English.
 */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  // SidebarMenu.adminPlugins
  title: '插件目录',
  intro: '本次构建加载的全部插件，按 Cordis Loader 的报告列出。',
  // MarketplacePlugins.searchPlugins
  search: '搜索插件',
  loading: '正在读取插件…',
  error: '暂时无法读取插件。',
  retry: '重试',
  empty: '暂无插件。',
  emptySearch: '没有匹配的插件。',
  enabledTag: '已启用',
  disabledTag: '已停用',
  unobserved: '未挂载',
  pending: '等待依赖',
  loadingPhase: '加载中',
  active: '已挂载',
  failed: '挂载失败',
  unloading: '卸载中',
  note: '本目录只负责列出。安装插件请使用 rabi plugin --profile web add <包名>；启用或停用请改写该 profile 的 cordis.patch.yml。',
} satisfies Record<string, string>

/** Plugin directory locale key union. */
export type PluginInventoryLocaleKey = keyof typeof zh

/** Traditional Chinese dictionary. */
export const zhTW = {
  // SidebarMenu.adminPlugins
  title: '外掛目錄',
  intro: '本次建置載入的全部外掛程式，依 Cordis Loader 的回報列出。',
  // MarketplacePlugins.searchPlugins
  search: '搜尋外掛程式',
  loading: '正在讀取外掛程式…',
  error: '暫時無法讀取外掛程式。',
  retry: '重試',
  empty: '尚無外掛程式。',
  emptySearch: '沒有相符的外掛程式。',
  enabledTag: '已啟用',
  disabledTag: '已停用',
  unobserved: '未掛載',
  pending: '等待相依項目',
  loadingPhase: '載入中',
  active: '已掛載',
  failed: '掛載失敗',
  unloading: '卸載中',
  note: '本目錄只負責列出。安裝外掛程式請使用 rabi plugin --profile web add <套件名>；啟用或停用請改寫該 profile 的 cordis.patch.yml。',
} satisfies Record<PluginInventoryLocaleKey, string>

/** Japanese dictionary. */
export const ja = {
  // SidebarMenu.adminPlugins
  title: 'プラグインカタログ',
  intro: 'このビルドが読み込むすべてのプラグインを、Cordis Loader の報告どおりに一覧します。',
  // MarketplacePlugins.searchPlugins
  search: 'プラグインを検索',
  loading: 'プラグインを読み込んでいます…',
  error: 'プラグインを一時的に読み取れません。',
  retry: '再試行',
  empty: 'プラグインはありません。',
  emptySearch: '一致するプラグインはありません。',
  // SettingsSubscription.enabled
  enabledTag: '有効',
  // SettingsSubscription.disabled
  disabledTag: '無効',
  unobserved: '未マウント',
  pending: '依存関係を待機中',
  loadingPhase: '読み込み中',
  active: 'マウント済み',
  failed: 'マウント失敗',
  unloading: 'アンロード中',
  note: 'このカタログは一覧するだけです。プラグインの追加は rabi plugin --profile web add <パッケージ名>、有効・無効の切り替えはプロファイルの cordis.patch.yml で行います。',
} satisfies Record<PluginInventoryLocaleKey, string>

/** English dictionary checked against the Chinese key set. */
export const en = {
  // SidebarMenu.adminPlugins
  title: 'Plugin Catalog',
  intro: 'Every plugin this build loads, as the Cordis Loader reports it.',
  // MarketplacePlugins.searchPlugins
  search: 'Search plugins',
  loading: 'Reading plugins…',
  error: 'Plugins are temporarily unavailable.',
  retry: 'Retry',
  empty: 'No plugins are available.',
  emptySearch: 'No matching plugins.',
  // SettingsSubscription.enabled
  enabledTag: 'Enabled',
  // SettingsSubscription.disabled
  disabledTag: 'Disabled',
  unobserved: 'Not mounted',
  pending: 'Waiting for dependencies',
  loadingPhase: 'Loading',
  active: 'Mounted',
  failed: 'Mount failed',
  unloading: 'Unloading',
  note: 'This catalogue only lists. Add a plugin to the profile with rabi plugin --profile web add <package>, and turn one on or off in that profile’s cordis.patch.yml.',
} satisfies Record<PluginInventoryLocaleKey, string>
