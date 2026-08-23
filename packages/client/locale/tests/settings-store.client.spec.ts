/** Language row store: snapshot-mirror action and the revision guard. */
import { describe, expect, it } from 'vitest'
import { createLanguageRowStore } from '../src/client/settings-store.ts'

const OPTIONS = [{ id: 'en', label: 'English' }, { id: 'zh-TW', label: '繁體中文' },
  { id: 'zh-CN', label: '简体中文' }, { id: 'ja', label: '日本語' }]

describe('createLanguageRowStore', () => {
  it('init shape: empty mirror with revision at -1', () => {
    const store = createLanguageRowStore().create()
    expect(store.getSnapshot()).toEqual({ active: '', options: [], revision: -1 })
  })

  it('sync mirrors the snapshot and advances the revision', () => {
    const store = createLanguageRowStore().create()
    store.actions.sync('zh-CN', OPTIONS, 0)
    expect(store.getSnapshot()).toEqual({ active: 'zh-CN', options: OPTIONS, revision: 0 })
    store.actions.sync('en', OPTIONS, 1)
    expect(store.getSnapshot().active).toBe('en')
    expect(store.getSnapshot().revision).toBe(1)
  })

  it('revision guard drops stale and duplicate writes', () => {
    const store = createLanguageRowStore().create()
    store.actions.sync('en', OPTIONS, 5)
    store.actions.sync('zh-CN', OPTIONS, 4)
    store.actions.sync('zh-CN', OPTIONS, 5)
    expect(store.getSnapshot().active).toBe('en')
    expect(store.getSnapshot().revision).toBe(5)
  })
})
