/**
 * Connections section copy.
 *
 * Written for someone who has never heard of OAuth. Two rules shape every
 * string: nothing names a protocol, and every sentence about access says who
 * holds it. "Connect" is a permission the person grants and can take back at
 * the provider, and the copy says exactly that rather than implying this app
 * is the place access lives.
 *
 * `expires` and `expiresSoon` exist because a connector that issued no refresh
 * token really does stop working at a stated moment; a page that showed only
 * "Connected" would be lying to whoever comes back to it next week.
 */

/** One connector's state as a sentence key. */
export type ConnectorsLocaleKey = keyof typeof zh

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  'nav': '连接',
  'title': '连接',
  'intro': '让 Rabi 代你使用其他服务 — 读取你的文件、查看你的日历、整理你的笔记。你随时可以收回。',

  'state.connected': '已连接',
  'state.connectedAs': '已连接 · {account}',
  'state.disconnected': '尚未连接',
  'state.needsSetup': '需要先在该服务注册一个应用程序',
  'state.expires': '有效期至 {date}，之后需要重新授权',

  'action.connect': '连接',
  'action.disconnect': '断开',
  'action.retry': '重试',
  'action.cancel': '取消',
  'action.dismiss': '知道了',

  'waiting.title': '请在浏览器中完成授权',
  'waiting.body': '我们已经打开了 {label} 的登录页面。在那里同意之后，这里会自动完成。',

  'empty.title': '目前没有可连接的服务',
  'empty.body': '这个版本没有装入任何连接器。装入之后它们会出现在这里。',

  'loading': '正在读取…',

  'setup.title': '为什么需要先注册？',
  'setup.body': '{label} 要求每个应用程序都有自己的身份编号，才会显示同意画面。请在 {label} 的开发者后台建立一个应用程序，并把编号填进设定档的 connectors.clientIds。',

  'error.title': '没有连接成功',
} satisfies Record<string, string>

/** Traditional Chinese dictionary. */
export const zhTW = {
  'nav': '連接',
  'title': '連接',
  'intro': '讓 Rabi 代你使用其他服務 — 讀取你的檔案、查看你的行事曆、整理你的筆記。你隨時可以收回。',

  'state.connected': '已連接',
  'state.connectedAs': '已連接 · {account}',
  'state.disconnected': '尚未連接',
  'state.needsSetup': '需要先在該服務註冊一個應用程式',
  'state.expires': '有效期至 {date}，之後需要重新授權',

  'action.connect': '連接',
  'action.disconnect': '中斷',
  'action.retry': '重試',
  'action.cancel': '取消',
  'action.dismiss': '知道了',

  'waiting.title': '請在瀏覽器中完成授權',
  'waiting.body': '我們已經開啟了 {label} 的登入頁面。在那裡同意之後，這裡會自動完成。',

  'empty.title': '目前沒有可連接的服務',
  'empty.body': '這個版本沒有裝入任何連接器。裝入之後它們會出現在這裡。',

  'loading': '正在讀取…',

  'setup.title': '為什麼需要先註冊？',
  'setup.body': '{label} 要求每個應用程式都有自己的身分編號，才會顯示同意畫面。請在 {label} 的開發者後台建立一個應用程式，並把編號填進設定檔的 connectors.clientIds。',

  'error.title': '沒有連接成功',
} satisfies Record<ConnectorsLocaleKey, string>

/** Japanese dictionary. */
export const ja = {
  'nav': '連携',
  'title': '連携',
  'intro': 'Rabi があなたに代わって他のサービスを使えるようにします — ファイルを読む、予定を確認する、メモを整理する。許可はいつでも取り消せます。',

  'state.connected': '連携済み',
  'state.connectedAs': '連携済み · {account}',
  'state.disconnected': '未連携',
  'state.needsSetup': 'このサービスにアプリを登録する必要があります',
  'state.expires': '{date} まで有効。その後は再度の許可が必要です',

  'action.connect': '連携する',
  'action.disconnect': '解除',
  'action.retry': 'やり直す',
  'action.cancel': 'キャンセル',
  'action.dismiss': '閉じる',

  'waiting.title': 'ブラウザで許可してください',
  'waiting.body': '{label} のログインページを開きました。そちらで許可すると、ここは自動的に完了します。',

  'empty.title': '連携できるサービスがありません',
  'empty.body': 'このビルドにはコネクタが組み込まれていません。組み込むとここに表示されます。',

  'loading': '読み込み中…',

  'setup.title': 'なぜ登録が必要なのですか',
  'setup.body': '{label} は、同意画面を表示するためにアプリごとの識別番号を求めます。{label} の開発者コンソールでアプリを作成し、その番号を設定の connectors.clientIds に記入してください。',

  'error.title': '連携できませんでした',
} satisfies Record<ConnectorsLocaleKey, string>

/** English dictionary checked against the Chinese key set. */
export const en = {
  'nav': 'Connections',
  'title': 'Connections',
  'intro': 'Let Rabi use other services on your behalf — read your files, check your calendar, keep your notes in order. You can take any of it back.',

  'state.connected': 'Connected',
  'state.connectedAs': 'Connected · {account}',
  'state.disconnected': 'Not connected',
  'state.needsSetup': 'Needs an application registered with this service first',
  'state.expires': 'Good until {date}, then asks again',

  'action.connect': 'Connect',
  'action.disconnect': 'Disconnect',
  'action.retry': 'Try again',
  'action.cancel': 'Cancel',
  'action.dismiss': 'Got it',

  'waiting.title': 'Finish in your browser',
  'waiting.body': 'We opened the {label} sign-in page. Say yes over there and this finishes on its own.',

  'empty.title': 'Nothing to connect yet',
  'empty.body': 'This build has no connectors installed. They appear here once one is.',

  'loading': 'Reading…',

  'setup.title': 'Why does this need registering?',
  'setup.body': '{label} gives every application its own id before it will show a consent screen. Create an application in the {label} developer console and put its id in connectors.clientIds in your configuration.',

  'error.title': 'That did not connect',
} satisfies Record<ConnectorsLocaleKey, string>
