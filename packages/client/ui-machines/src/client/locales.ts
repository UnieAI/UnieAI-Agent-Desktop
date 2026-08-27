/** Copy for the machine control in the composer. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  label: 'Machine',
  local: 'This computer',
  choose: 'Work on another machine',
  none: 'No other machines are configured',
  configHint: 'Machines come from your SSH configuration',
  openConfig: 'Open SSH config',
  busy: 'Switching…',
  add: 'Add a machine',
  addAlias: 'Name',
  addHostName: 'Host',
  addUser: 'User',
  addPort: 'Port',
  addKey: 'Key file',
  addJump: 'Through',
  addSubmit: 'Add',
  addCancel: 'Cancel',
  addHint: 'Appended to your SSH configuration; nothing already in it is changed.',
  remove: 'Remove',
  removeConfirm: 'Remove {machine} from your SSH configuration?',
  test: 'Test',
  reachable: 'Answers',
  unreachable: 'No answer',
}

/** Simplified Chinese. */
export const zh: { [Key in keyof typeof en]: string } = {
  label: '机器',
  local: '本机',
  choose: '切换到其他机器',
  none: '没有配置其他机器',
  configHint: '机器列表来自你的 SSH 配置',
  openConfig: '打开 SSH 配置',
  busy: '切换中…',
  add: '添加机器',
  addAlias: '名称',
  addHostName: '主机',
  addUser: '用户',
  addPort: '端口',
  addKey: '密钥文件',
  addJump: '经由',
  addSubmit: '添加',
  addCancel: '取消',
  addHint: '追加到你的 SSH 配置末尾；已有的内容不会被改动。',
  remove: '移除',
  removeConfirm: '要把 {machine} 从你的 SSH 配置中移除吗？',
  test: '测试',
  reachable: '有响应',
  unreachable: '没有响应',
}

/** Traditional Chinese. */
export const zhTW: { [Key in keyof typeof en]: string } = {
  label: '機器',
  local: '本機',
  choose: '切換到其他機器',
  none: '沒有設定其他機器',
  configHint: '機器清單來自你的 SSH 設定',
  openConfig: '開啟 SSH 設定',
  busy: '切換中…',
  add: '新增機器',
  addAlias: '名稱',
  addHostName: '主機',
  addUser: '使用者',
  addPort: '埠',
  addKey: '金鑰檔',
  addJump: '經由',
  addSubmit: '新增',
  addCancel: '取消',
  addHint: '附加到你的 SSH 設定末尾；已經在裡面的東西不會被改動。',
  remove: '移除',
  removeConfirm: '要把 {machine} 從你的 SSH 設定中移除嗎？',
  test: '測試',
  reachable: '有回應',
  unreachable: '沒有回應',
}

/** Japanese. */
export const ja: { [Key in keyof typeof en]: string } = {
  label: 'マシン',
  local: 'このコンピュータ',
  choose: '別のマシンで作業する',
  none: '他のマシンは設定されていません',
  configHint: 'マシン一覧は SSH 設定から読み込まれます',
  openConfig: 'SSH 設定を開く',
  busy: '切り替え中…',
  add: 'マシンを追加',
  addAlias: '名前',
  addHostName: 'ホスト',
  addUser: 'ユーザー',
  addPort: 'ポート',
  addKey: '鍵ファイル',
  addJump: '経由',
  addSubmit: '追加',
  addCancel: 'キャンセル',
  addHint: 'SSH 設定の末尾に追記します。既存の内容は変更しません。',
  remove: '削除',
  removeConfirm: '{machine} を SSH 設定から削除しますか？',
  test: '接続テスト',
  reachable: '応答あり',
  unreachable: '応答なし',
}

/** Copy keys this plugin owns. */
export type MachineLocaleKey = keyof typeof en

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The machine control in the composer. */
    'conversation.machine': MachineLocaleKey
  }
}
