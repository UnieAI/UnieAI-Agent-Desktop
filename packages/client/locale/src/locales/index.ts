/**
 * The common-namespace dictionaries. zh is the source of truth for the
 * key set (Chinese-first repo convention); every other locale is checked
 * complete against it — a missing or extra key is a compile error.
 */
export { zh } from './zh.ts'
export { en } from './en.ts'
export { zhTW } from './zh-tw.ts'
export { ja } from './ja.ts'
export type { CommonKey } from './zh.ts'
