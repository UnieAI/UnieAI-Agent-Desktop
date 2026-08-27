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
  'intro': '让 Rabi 按你的方式运作',
  // MarketplacePlugins.back
  'back': '返回',
  'refresh': '重新读取',
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
  // ── the first-party UnieAI Studio entry ──────────────────────────────────
  'studio.name': 'UnieAI Studio',
  'studio.iconAlt': 'UnieAI Studio 图标',
  'studio.description': '绑定 UnieAI Studio 账号，把它的模型目录与工具带进对话。',
  'studio.bound': '已绑定',
  'studio.boundBody': '此账号已绑定 UnieAI Studio。以下工具可以在对话中直接调用。',
  'studio.unbound': '此账号尚未绑定 UnieAI Studio。「绑定」会在浏览器中打开 UnieAI 网站的设置页面，绑定卡片就在「个人资料」那一栏。',
  'studio.bind': '绑定',
  'studio.loading': '正在读取绑定状态…',
  'studio.signedOut': '登录 UnieAI 账号后，这里会显示 UnieAI Studio 的绑定状态。',
  'studio.unsupported': '本部署尚未提供 MCP 路由，因此读不到 UnieAI Studio 的绑定状态。',
  'studio.failed': '无法读取 UnieAI Studio 的绑定状态。',
  // ── the skills destination ───────────────────────────────────────────────
  'skills.title': '技能',
  'skills.intro': '技能是随项目提供、用 /名称 调用的指令集。',
  // Kept for a build that composes no skill registry at all.
  'skills.unsupported': '本版本没有账号级的技能目录。技能属于当前会话所在的项目：在输入框里键入 / 就能看到该会话可用的技能。',
  'skills.refresh': '重新读取',
  'skills.empty': '这个部署没有提供任何技能。',
  'skills.group.personal': '你写的',
  'skills.group.project': '项目提供',
  'skills.group.bundled': '本版本自带',
  'skills.group.other': '其他来源',
  'skills.userOnly': '仅用户',
  'skills.open': '打开文件',
  'skills.write': '技能就是一个 SKILL.md 文件。要新增一个，直接让代理帮你写——它知道该放哪里、格式怎么写。',
  // ── the settings destination ─────────────────────────────────────────────
  'manage.title': '插件设置',
  'manage.intro': '此账号连接的 MCP 服务器，以及本次构建载入并可配置的插件。',
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
  'directory.searchPlaceholder': '搜索插件',
  'directory.installedTitle': '已安装',
  'directory.groupOther': '其他',
  'directory.empty': '目录中还没有插件。',
  'directory.noMatch': '没有符合的插件。',
  'directory.install': '安装',
  'directory.remove': '移除',
  'directory.overflow': '更多操作',
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
  'intro': '讓 Rabi 按你的方式運作',
  // MarketplacePlugins.back
  'back': '返回',
  'refresh': '重新讀取',
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
  // ── the first-party UnieAI Studio entry ──────────────────────────────────
  'studio.name': 'UnieAI Studio',
  'studio.iconAlt': 'UnieAI Studio 圖示',
  'studio.description': '綁定 UnieAI Studio 帳號，把它的模型目錄與工具帶進對話。',
  'studio.bound': '已綁定',
  'studio.boundBody': '此帳號已綁定 UnieAI Studio。以下工具可以在對話中直接呼叫。',
  'studio.unbound': '此帳號尚未綁定 UnieAI Studio。「綁定」會在瀏覽器開啟 UnieAI 網站的設定頁面，綁定卡片就在「個人資料」那一欄。',
  'studio.bind': '綁定',
  'studio.loading': '正在讀取綁定狀態…',
  'studio.signedOut': '登入 UnieAI 帳號後，這裡會顯示 UnieAI Studio 的綁定狀態。',
  'studio.unsupported': '本部署尚未提供 MCP 路由，因此讀不到 UnieAI Studio 的綁定狀態。',
  'studio.failed': '無法讀取 UnieAI Studio 的綁定狀態。',
  // ── the skills destination ───────────────────────────────────────────────
  'skills.title': '技能',
  'skills.intro': '技能是隨專案提供、用 /名稱 呼叫的指令集。',
  // Kept for a build that composes no skill registry at all.
  'skills.unsupported': '本版本沒有帳號層級的技能目錄。技能屬於目前對話所在的專案：在輸入框裡輸入 / 就會看到該對話可用的技能。',
  'skills.refresh': '重新讀取',
  'skills.empty': '這個部署沒有提供任何技能。',
  'skills.group.personal': '你寫的',
  'skills.group.project': '專案提供',
  'skills.group.bundled': '本版本自帶',
  'skills.group.other': '其他來源',
  'skills.userOnly': '僅使用者',
  'skills.open': '開啟檔案',
  'skills.write': '技能就是一個 SKILL.md 檔案。要新增一個，直接請代理幫你寫——它知道要放哪裡、格式怎麼寫。',
  // ── the settings destination ─────────────────────────────────────────────
  'manage.title': '外掛程式設定',
  'manage.intro': '此帳號連接的 MCP 伺服器，以及這次建置載入並可設定的外掛程式。',
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
  'directory.searchPlaceholder': '搜尋外掛程式',
  'directory.installedTitle': '已安裝',
  'directory.groupOther': '其他',
  'directory.empty': '目錄中還沒有外掛。',
  'directory.noMatch': '沒有符合的外掛。',
  'directory.install': '安裝',
  'directory.remove': '移除',
  'directory.overflow': '更多操作',
  'directory.planNote': '目前方案不包含安裝外掛。',
} satisfies Record<PluginsPageKey, string>

/** Japanese dictionary. */
export const ja = {
  // AgentNext.plugins
  'nav': 'プラグイン',
  // MarketplacePlugins.breadcrumb
  'title': 'プラグイン',
  // MarketplacePlugins.discoveryHeroTitle
  'intro': 'Rabi をあなた好みに',
  // MarketplacePlugins.back
  'back': '戻る',
  'refresh': '再読み込み',
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
  // ── the first-party UnieAI Studio entry ──────────────────────────────────
  'studio.name': 'UnieAI Studio',
  'studio.iconAlt': 'UnieAI Studio のアイコン',
  'studio.description': 'UnieAI Studio アカウントと連携し、そのモデルカタログとツールを会話に取り込みます。',
  'studio.bound': '連携済み',
  'studio.boundBody': 'このアカウントは UnieAI Studio と連携済みです。以下のツールを会話からそのまま呼び出せます。',
  'studio.unbound': 'このアカウントはまだ UnieAI Studio と連携していません。「連携」を押すと UnieAI サイトの設定ページがブラウザーで開きます。連携カードは「プロフィール」タブにあります。',
  'studio.bind': '連携',
  'studio.loading': '連携状態を読み込んでいます…',
  'studio.signedOut': 'UnieAI アカウントにサインインすると、UnieAI Studio の連携状態が表示されます。',
  'studio.unsupported': 'このデプロイはまだ MCP ルートを提供していないため、UnieAI Studio の連携状態を読み取れません。',
  'studio.failed': 'UnieAI Studio の連携状態を読み取れませんでした。',
  // ── the skills destination ───────────────────────────────────────────────
  'skills.title': 'スキル',
  'skills.intro': 'スキルはプロジェクトに付属し、/名前 で呼び出す手順書です。',
  // Kept for a build that composes no skill registry at all.
  'skills.unsupported': 'このビルドにアカウント単位のスキルカタログはありません。スキルは現在のセッションのプロジェクトに属します。入力欄に / と入力すると、そのセッションで使えるスキルが表示されます。',
  'skills.refresh': '読み直す',
  'skills.empty': 'このデプロイはスキルを提供していません。',
  'skills.group.personal': 'あなたが書いたもの',
  'skills.group.project': 'プロジェクト提供',
  'skills.group.bundled': 'このビルド同梱',
  'skills.group.other': 'その他',
  'skills.userOnly': 'ユーザー専用',
  'skills.open': 'ファイルを開く',
  'skills.write': 'スキルは SKILL.md というファイルです。追加したいときはエージェントに書いてもらってください——置き場所も書式も知っています。',
  // ── the settings destination ─────────────────────────────────────────────
  'manage.title': 'プラグイン設定',
  'manage.intro': 'このアカウントが接続している MCP サーバーと、このビルドが読み込み設定できるプラグインです。',
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
  'directory.searchPlaceholder': 'プラグインを検索',
  'directory.installedTitle': 'インストール済み',
  'directory.groupOther': 'その他',
  'directory.empty': 'ディレクトリにプラグインがまだありません。',
  'directory.noMatch': '該当するプラグインはありません。',
  'directory.install': 'インストール',
  'directory.remove': '削除',
  'directory.overflow': 'その他の操作',
  'directory.planNote': '現在のプランにはプラグインのインストールが含まれていません。',
} satisfies Record<PluginsPageKey, string>

/** English dictionary, checked complete against the zh key set. */
export const en = {
  // AgentNext.plugins
  'nav': 'Plugins',
  // MarketplacePlugins.breadcrumb
  'title': 'Plugins',
  // MarketplacePlugins.discoveryHeroTitle
  'intro': 'Make Rabi work your way',
  // MarketplacePlugins.back
  'back': 'Back',
  'refresh': 'Read again',
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
  // ── the first-party UnieAI Studio entry ──────────────────────────────────
  'studio.name': 'UnieAI Studio',
  'studio.iconAlt': 'UnieAI Studio icon',
  'studio.description': 'Bind a UnieAI Studio account to bring its model catalogue and tools into a conversation.',
  'studio.bound': 'Bound',
  'studio.boundBody': 'This account is bound to UnieAI Studio. The tools below can be called from a conversation.',
  'studio.unbound': 'This account has not bound UnieAI Studio yet. Bind opens the UnieAI site’s settings page in a browser; the binding card is on its Profile tab.',
  'studio.bind': 'Bind',
  'studio.loading': 'Reading the binding…',
  'studio.signedOut': 'Sign in to your UnieAI account to see whether UnieAI Studio is bound.',
  'studio.unsupported': 'This deployment serves no MCP route, so the UnieAI Studio binding cannot be read.',
  'studio.failed': 'The UnieAI Studio binding could not be read.',
  // ── the skills destination ───────────────────────────────────────────────
  'skills.title': 'Skills',
  'skills.intro': 'Skills are instruction sets that ship with a project and are invoked as /name.',
  // Kept for a build that composes no skill registry at all.
  'skills.unsupported': 'This build has no account-level skill catalogue. Skills belong to the project a session runs in: type / in the composer to see the ones that session can invoke.',
  'skills.refresh': 'Read again',
  'skills.empty': 'This deployment serves no skills.',
  'skills.group.personal': 'Yours',
  'skills.group.project': 'From this project',
  'skills.group.bundled': 'Shipped with this build',
  'skills.group.other': 'Other sources',
  'skills.userOnly': 'user only',
  'skills.open': 'Open file',
  'skills.write': 'A skill is a SKILL.md file. To add one, ask the agent to write it — it knows where they go and what the format is.',
  // ── the settings destination ─────────────────────────────────────────────
  'manage.title': 'Plugin settings',
  'manage.intro': 'The MCP servers this account has connected, and the plugins this build loads and can configure.',
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
  'directory.searchPlaceholder': 'Search plugins',
  'directory.installedTitle': 'Installed',
  'directory.groupOther': 'Other',
  'directory.empty': 'The directory has no plugins yet.',
  'directory.noMatch': 'No plugins match.',
  'directory.install': 'Install',
  'directory.remove': 'Remove',
  'directory.overflow': 'More actions',
  'directory.planNote': 'Your plan does not include installing plugins.',
} satisfies Record<PluginsPageKey, string>
