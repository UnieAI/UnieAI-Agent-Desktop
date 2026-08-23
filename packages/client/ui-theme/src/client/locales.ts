/** `settings.theme` namespace dictionaries (the Appearance row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'appearance.title': '外观',
  'appearance.light': '浅色',
  'appearance.dark': '深色',
  'appearance.system': '跟随系统',
} satisfies Record<string, string>

/** The settings.theme namespace key union. */
export type ThemeKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'appearance.title': 'Appearance',
  'appearance.light': 'Light',
  'appearance.dark': 'Dark',
  'appearance.system': 'System',
} satisfies Record<ThemeKey, string>

/** Traditional Chinese dictionary, checked complete against the zh key set. */
export const zhTW = {
  'appearance.title': '外觀',
  'appearance.light': '明亮模式',
  'appearance.dark': '陰暗模式',
  'appearance.system': '跟隨系統',
} satisfies Record<ThemeKey, string>

/** Japanese dictionary, checked complete against the zh key set. */
export const ja = {
  'appearance.title': '外観',
  'appearance.light': 'ライト',
  'appearance.dark': 'ダーク',
  'appearance.system': 'システムに合わせる',
} satisfies Record<ThemeKey, string>
