/**
 * Plugins page copy.
 *
 * Every key whose text the UnieAI Copilot web product already publishes is
 * copied VERBATIM from `messages/{en,zh-tw,zh-cn,ja}.json` — the source
 * namespace and key are named beside each line. The page is this product's
 * Plugins destination and the reference product has one of its own; a
 * paraphrase would make the desktop look like a different feature rather than
 * the same one.
 *
 * `Studio MCP` is a literal in every locale. It names where the servers live,
 * and the reference does the same with its own `Agent Remote MCP` heading,
 * which is untranslated in all four of its dictionaries.
 *
 * The remaining keys — the ones below the divider in each dictionary —
 * describe states the reference page cannot be in (no session, a deployment
 * older than the MCP route, a list still loading) and the shape this page
 * gives a row that the reference does not have. They are this package's own
 * words, following the wording the API Provider section already uses for the
 * same three states, because they are the same three states.
 *
 * There is no key for a tool that reported no description, and there must not
 * be one. A card whose only line read "no description available" would be this
 * package writing copy about the host's silence; the card simply stops after
 * the name (see `StudioMcpTool` in `studio-mcp-source.ts`).
 *
 * All four shipped locales carry a complete dictionary, so nothing here falls
 * back to English.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  // AgentNext.plugins
  'nav': '插件',
  // MarketplacePlugins.breadcrumb
  'title': '插件',
  // MarketplacePlugins.discoveryHeroTitle
  'intro': '让 UnieAI Agent 按你的方式运作',
  // MarketplacePlugins.back
  'back': '返回',
  'mcp.title': 'Studio MCP',
  // MarketplacePlugins.connectorsHint
  'mcp.intro': '通过 Model Context Protocol (MCP) 连接的外部服务与工具。',
  // Settings.noAgentMcp
  'mcp.empty': '尚未配置任何 Agent Remote MCP',
  // Settings.connectorToolsTitle
  'mcp.toolsTitle': '提供的工具',
  // ── states and shapes the web page does not have ──────────────────────────
  'mcp.loading': '正在读取 MCP 服务器…',
  'mcp.signedOut': '登录 UnieAI 账号后，这里会显示该账号的 MCP 服务器。',
  'mcp.unreadable': '无法读取 UnieAI 的 MCP 服务器。',
  'mcp.retry': '重试',
  'mcp.unsupported': '本版本还无法读取账号的 MCP 服务器。',
  'mcp.unsupportedBody': '本部署尚未提供 MCP 路由。请在 UnieAI Studio 中添加和管理 MCP 服务器；提供该路由的版本会在这里列出它们。',
  'mcp.emptyBody': '在 UnieAI Studio 中添加 MCP 服务器后，这里就会列出。',
  'mcp.readOnly': 'MCP 服务器的添加、修改与删除请至 UnieAI Studio。本页只负责列出。',
  'mcp.unnamed': '未命名 MCP 服务器',
  'mcp.originUnset': '未提供来源地址',
  'mcp.toolsNone': '未报告任何工具',
  // ── the directory ───────────────────────────────────────────────────────
  'directory.loading': '正在读取插件目录…',
  'directory.unsupported': '本版本还无法读取插件目录。提供该路由的版本会在这里列出可安装的插件。',
  'directory.signedOut': '登录 UnieAI 账号后，这里会显示可安装的插件。',
  'directory.failed': '无法读取插件目录。',
  'directory.retry': '重试',
  'directory.filterLabel': '按来源筛选',
  'directory.filterAll': '全部',
  'directory.filterInstalled': '已安装',
  'directory.filterMore': '更多',
  'tab.mcp': 'Studio MCP',
  'tab.directory': '插件目录',
  'tab.build': '本机运行',
  'directory.searchPlaceholder': '搜索插件',
  'directory.groupOther': '其他',
  'directory.empty': '目录中还没有插件。',
  'directory.noMatch': '没有符合的插件。',
  'directory.install': '安装',
  'directory.remove': '移除',
  'directory.planNote': '当前方案不包含安装插件。',
} satisfies Record<string, string>

/** The plugins namespace key union. */
export type PluginsPageKey = keyof typeof zh

/** Traditional Chinese dictionary. */
export const zhTW = {
  // AgentNext.plugins
  'nav': '外掛程式',
  // MarketplacePlugins.breadcrumb
  'title': '外掛程式',
  // MarketplacePlugins.discoveryHeroTitle
  'intro': '讓 UnieAI Agent 按你的方式運作',
  // MarketplacePlugins.back
  'back': '返回',
  'mcp.title': 'Studio MCP',
  // MarketplacePlugins.connectorsHint
  'mcp.intro': '透過 Model Context Protocol (MCP) 連接的外部服務與工具。',
  // Settings.noAgentMcp
  'mcp.empty': '尚未設定任何 Agent Remote MCP',
  // Settings.connectorToolsTitle
  'mcp.toolsTitle': '提供的工具',
  // ── states and shapes the web page does not have ──────────────────────────
  'mcp.loading': '正在讀取 MCP 伺服器…',
  'mcp.signedOut': '登入 UnieAI 帳號後，這裡會顯示該帳號的 MCP 伺服器。',
  'mcp.unreadable': '無法讀取 UnieAI 的 MCP 伺服器。',
  'mcp.retry': '重試',
  'mcp.unsupported': '本版本還無法讀取帳號的 MCP 伺服器。',
  'mcp.unsupportedBody': '本部署尚未提供 MCP 路由。請在 UnieAI Studio 中新增與管理 MCP 伺服器；提供該路由的版本會在這裡列出它們。',
  'mcp.emptyBody': '在 UnieAI Studio 新增 MCP 伺服器後，這裡就會列出。',
  'mcp.readOnly': 'MCP 伺服器的新增、修改與刪除請至 UnieAI Studio。本頁只負責列出。',
  'mcp.unnamed': '未命名 MCP 伺服器',
  'mcp.originUnset': '未提供來源位址',
  'mcp.toolsNone': '未回報任何工具',
  // ── the directory ───────────────────────────────────────────────────────
  'directory.loading': '正在讀取外掛目錄…',
  'directory.unsupported': '本版本還無法讀取外掛目錄。提供該路由的版本會在這裡列出可安裝的外掛。',
  'directory.signedOut': '登入 UnieAI 帳號後，這裡會顯示可安裝的外掛。',
  'directory.failed': '無法讀取外掛目錄。',
  'directory.retry': '重試',
  'directory.filterLabel': '依來源篩選',
  'directory.filterAll': '全部',
  'directory.filterInstalled': '已安裝',
  'directory.filterMore': '更多',
  'directory.searchPlaceholder': '搜尋外掛',
  'directory.groupOther': '其他',
  'directory.empty': '目錄中還沒有外掛。',
  'directory.noMatch': '沒有符合的外掛。',
  'directory.install': '安裝',
  'directory.remove': '移除',
  'directory.planNote': '目前方案不包含安裝外掛。',  'tab.mcp': 'Studio MCP',
  'tab.directory': '外掛目錄',
  'tab.build': '本機執行',

} satisfies Record<PluginsPageKey, string>

/** Japanese dictionary. */
export const ja = {
  // AgentNext.plugins
  'nav': 'プラグイン',
  // MarketplacePlugins.breadcrumb
  'title': 'プラグイン',
  // MarketplacePlugins.discoveryHeroTitle
  'intro': 'UnieAI Agent をあなた好みに',
  // MarketplacePlugins.back
  'back': '戻る',
  'mcp.title': 'Studio MCP',
  // MarketplacePlugins.connectorsHint
  'mcp.intro': 'Model Context Protocol (MCP) で接続される外部サービスとツールです。',
  // Settings.noAgentMcp
  'mcp.empty': 'Agent Remote MCP が設定されていません',
  // Settings.connectorToolsTitle
  'mcp.toolsTitle': 'ツール',
  // ── states and shapes the web page does not have ──────────────────────────
  'mcp.loading': 'MCP サーバーを読み込んでいます…',
  'mcp.signedOut': 'UnieAI アカウントにサインインすると、そのアカウントの MCP サーバーが表示されます。',
  'mcp.unreadable': 'UnieAI の MCP サーバーを読み取れませんでした。',
  'mcp.retry': '再試行',
  'mcp.unsupported': 'このビルドではアカウントの MCP サーバーをまだ読み取れません。',
  'mcp.unsupportedBody': 'このデプロイはまだ MCP ルートを提供していません。MCP サーバーの追加と管理は UnieAI Studio で行ってください。ルートを提供するビルドではここに一覧が表示されます。',
  'mcp.emptyBody': 'UnieAI Studio で MCP サーバーを追加すると、ここに表示されます。',
  'mcp.readOnly': 'MCP サーバーの追加・編集・削除は UnieAI Studio で行います。このページは一覧を表示するだけです。',
  'mcp.unnamed': '名前のない MCP サーバー',
  'mcp.originUnset': 'オリジンが未提供',
  'mcp.toolsNone': 'ツールの報告はありません',
  // ── the directory ───────────────────────────────────────────────────────
  'directory.loading': 'プラグインディレクトリを読み込み中…',
  'directory.unsupported': 'このビルドではプラグインディレクトリを読み込めません。対応するバージョンではインストール可能なプラグインがここに表示されます。',
  'directory.signedOut': 'UnieAI アカウントにサインインすると、インストールできるプラグインがここに表示されます。',
  'directory.failed': 'プラグインディレクトリを読み込めませんでした。',
  'directory.retry': '再試行',
  'directory.filterLabel': '提供元で絞り込む',
  'directory.filterAll': 'すべて',
  'directory.filterInstalled': 'インストール済み',
  'directory.filterMore': 'その他',
  'tab.mcp': 'Studio MCP',
  'tab.directory': 'プラグインディレクトリ',
  'tab.build': 'このビルド',
  'directory.searchPlaceholder': 'プラグインを検索',
  'directory.groupOther': 'その他',
  'directory.empty': 'ディレクトリにプラグインがまだありません。',
  'directory.noMatch': '該当するプラグインはありません。',
  'directory.install': 'インストール',
  'directory.remove': '削除',
  'directory.planNote': '現在のプランにはプラグインのインストールが含まれていません。',
} satisfies Record<PluginsPageKey, string>

/** English dictionary, checked complete against the zh key set. */
export const en = {
  // AgentNext.plugins
  'nav': 'Plugins',
  // MarketplacePlugins.breadcrumb
  'title': 'Plugins',
  // MarketplacePlugins.discoveryHeroTitle
  'intro': 'Make UnieAI Agent work your way',
  // MarketplacePlugins.back
  'back': 'Back',
  'mcp.title': 'Studio MCP',
  // MarketplacePlugins.connectorsHint
  'mcp.intro': 'External services and tools connected via the Model Context Protocol (MCP).',
  // Settings.noAgentMcp
  'mcp.empty': 'No Agent Remote MCPs configured',
  // Settings.connectorToolsTitle
  'mcp.toolsTitle': 'Tools',
  // ── states and shapes the web page does not have ──────────────────────────
  'mcp.loading': 'Reading your MCP servers…',
  'mcp.signedOut': 'Sign in to your UnieAI account to see its MCP servers here.',
  'mcp.unreadable': 'The UnieAI MCP servers could not be read.',
  'mcp.retry': 'Retry',
  'mcp.unsupported': 'This build cannot read your account’s MCP servers yet.',
  'mcp.unsupportedBody': 'This deployment serves no MCP route yet. Add and manage MCP servers in UnieAI Studio; a build that serves the route lists them here.',
  'mcp.emptyBody': 'Add an MCP server in UnieAI Studio and it appears here.',
  'mcp.readOnly': 'MCP servers are added, edited and removed in UnieAI Studio. This page only lists them.',
  'mcp.unnamed': 'Unnamed MCP server',
  'mcp.originUnset': 'No origin reported',
  'mcp.toolsNone': 'No tools reported',
  // ── the directory ───────────────────────────────────────────────────────
  'directory.loading': 'Reading the plugin directory…',
  'directory.unsupported': 'This build cannot read the plugin directory yet. A build that serves the route will list installable plugins here.',
  'directory.signedOut': 'Sign in to your UnieAI account to see the plugins you can install.',
  'directory.failed': 'Could not read the plugin directory.',
  'directory.retry': 'Retry',
  'directory.filterLabel': 'Filter by publisher',
  'directory.filterAll': 'All',
  'directory.filterInstalled': 'Installed',
  'directory.filterMore': 'More',
  'tab.mcp': 'Studio MCP',
  'tab.directory': 'Plugin directory',
  'tab.build': 'This build',
  'directory.searchPlaceholder': 'Search plugins',
  'directory.groupOther': 'Other',
  'directory.empty': 'The directory has no plugins yet.',
  'directory.noMatch': 'No plugins match.',
  'directory.install': 'Install',
  'directory.remove': 'Remove',
  'directory.planNote': 'Your plan does not include installing plugins.',
} satisfies Record<PluginsPageKey, string>
