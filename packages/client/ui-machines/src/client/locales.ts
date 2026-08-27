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
}

/** Copy keys this plugin owns. */
export type MachineLocaleKey = keyof typeof en

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The machine control in the composer. */
    'conversation.machine': MachineLocaleKey
  }
}
