/**
 * Shell chrome, sidebar nav-row, and General-nav dictionaries; feature rows
 * own their copy. The nav-row wording tracks the UnieAI web product's own
 * sidebar (`AgentNext.plugins`).
 *
 * `subtitle` is the header band's summary line. The reference enumerates the
 * features its own settings page carries; this one does not, because the
 * sections here are whatever the composition registered — an enumeration
 * would name pages a given build may not have.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'subtitle': '管理你的账号，以及这个应用的行为',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
  'nav.plugins': '插件',
  'nav.group.personal': '个人',
  'nav.group.chat': '对话',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'subtitle': 'Manage your account and how this app behaves',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'nav.plugins': 'Plugins',
  'nav.group.personal': 'Personal',
  'nav.group.chat': 'Chat',
} satisfies Record<SettingsKey, string>

/** Traditional Chinese dictionary, checked complete against the zh key set. */
export const zhTW = {
  'trigger': '設定',
  'title': '設定',
  'subtitle': '管理你的帳號，以及這個應用程式的行為',
  'close': '關閉',
  'openDocument': '開啟設定檔',
  'openDocument.error': '無法開啟設定檔',
  'general.nav': '一般',
  'nav.plugins': '外掛程式',
  'nav.group.personal': '個人',
  'nav.group.chat': '對話',
} satisfies Record<SettingsKey, string>

/** Japanese dictionary, checked complete against the zh key set. */
export const ja = {
  'trigger': '設定',
  'title': '設定',
  'subtitle': 'アカウントとこのアプリの動作を管理します',
  'close': '閉じる',
  'openDocument': '設定ファイルを開く',
  'openDocument.error': '設定ファイルを開けませんでした',
  'general.nav': '一般',
  'nav.plugins': 'プラグイン',
  'nav.group.personal': '個人',
  'nav.group.chat': 'チャット',
} satisfies Record<SettingsKey, string>
