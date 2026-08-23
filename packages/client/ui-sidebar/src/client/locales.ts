/**
 * `sidebar` namespace dictionaries: the column's own controls (brand row, the
 * New chat nav row, fold toggle). The nav wording tracks the UnieAI web
 * product's own sidebar (`AgentNext.newChat`) so the desktop column reads as
 * the same product.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'session.new': '新聊天',
  'session.new.label': '新聊天',
  'search': '搜索',
  'toggle.open': '打开侧边栏',
  'toggle.collapse': '收起侧边栏',
} satisfies Record<string, string>

/** The sidebar namespace key union. */
export type SidebarKey = keyof typeof zh

/** Traditional Chinese dictionary. */
export const zhTW = {
  'session.new': '新聊天',
  'session.new.label': '新聊天',
  'search': '搜尋',
  'toggle.open': '開啟側邊欄',
  'toggle.collapse': '收合側邊欄',
} satisfies Record<SidebarKey, string>

/** Japanese dictionary. */
export const ja = {
  'session.new': '新規チャット',
  'session.new.label': '新規チャット',
  'search': '検索',
  'toggle.open': 'サイドバーを開く',
  'toggle.collapse': 'サイドバーを折りたたむ',
} satisfies Record<SidebarKey, string>

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'session.new': 'New chat',
  'session.new.label': 'New chat',
  'search': 'Search',
  'toggle.open': 'Open sidebar',
  'toggle.collapse': 'Collapse sidebar',
} satisfies Record<SidebarKey, string>
