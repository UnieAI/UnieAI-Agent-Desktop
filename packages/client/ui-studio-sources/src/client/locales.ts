/** Copy for the citations block under a Studio knowledge-base result. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  title: 'Sources',
  /** Shown in place of a document name the tool did not report. */
  unnamed: 'Untitled document',
  page: 'p. {page}',
  match: 'Relevance {percent}%',
}

/** Simplified Chinese. */
export const zh: { [Key in keyof typeof en]: string } = {
  title: '来源',
  unnamed: '未命名文件',
  page: '第 {page} 页',
  match: '相关度 {percent}%',
}

/** Traditional Chinese. */
export const zhTW: { [Key in keyof typeof en]: string } = {
  title: '來源',
  unnamed: '未命名文件',
  page: '第 {page} 頁',
  match: '相關度 {percent}%',
}

/** Japanese. */
export const ja: { [Key in keyof typeof en]: string } = {
  title: '出典',
  unnamed: '無題のドキュメント',
  page: 'p. {page}',
  match: '関連度 {percent}%',
}

/** Copy keys this plugin owns. */
export type StudioSourcesLocaleKey = keyof typeof en

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Citations under a Studio knowledge-base tool result. */
    'conversation.studioSources': StudioSourcesLocaleKey
  }
}
