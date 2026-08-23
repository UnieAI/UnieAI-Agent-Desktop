/**
 * The cue catalog and its per-device cell: the eleven names the UnieAI Copilot
 * web product ships, the URL each one resolves to, and a preference read that
 * survives an absent, hostile, or stale storage.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NOTIFY_SOUND, NOTIFY_SOUNDS, NOTIFY_SOUND_STORAGE_KEY, browserNotifySoundPlayer,
  browserNotifySoundStorage, isNotifySoundId, notifySoundUrl, readNotifySoundId,
  writeNotifySoundId, type NotifySoundStorage,
} from '../src/client/notify-sounds.ts'

/** An in-memory preference cell. */
function memoryStorage(initial?: string): NotifySoundStorage & { readonly written: string[] } {
  let value = initial ?? null
  const written: string[] = []
  return {
    written,
    getItem: () => value,
    setItem: (_key, next) => {
      written.push(next)
      value = next
    },
  }
}

describe('notify sound catalog', () => {
  it('ships the web product\'s eleven cues in picker order, default first', () => {
    expect(NOTIFY_SOUNDS.map(sound => sound.label)).toEqual([
      'Handoff', 'Antic', 'Cheer', 'Droplet', 'Milestone', 'Passage',
      'Portal', 'Rattle', 'Rebound', 'Slide', 'Welcome',
    ])
    expect(NOTIFY_SOUNDS[0]?.id).toBe(DEFAULT_NOTIFY_SOUND)
  })

  it('resolves each cue to the clip the web shell serves', () => {
    for (const sound of NOTIFY_SOUNDS) {
      expect(notifySoundUrl(sound.id)).toBe(`/sounds/notify/${sound.id}.wav`)
    }
  })

  it('recognises only catalog ids', () => {
    expect(isNotifySoundId('portal')).toBe(true)
    expect(isNotifySoundId('fanfare')).toBe(false)
  })
})

describe('notify sound preference', () => {
  it('keeps the web product\'s storage key so a shared choice carries over', () => {
    expect(NOTIFY_SOUND_STORAGE_KEY).toBe('unieai:notify-sound')
  })

  it('round-trips a chosen cue', () => {
    const storage = memoryStorage()
    writeNotifySoundId(storage, 'cheer')
    expect(storage.written).toEqual(['cheer'])
    expect(readNotifySoundId(storage)).toBe('cheer')
  })

  it('falls back to the default for an absent, unknown, or unreadable cell', () => {
    expect(readNotifySoundId(undefined)).toBe(DEFAULT_NOTIFY_SOUND)
    expect(readNotifySoundId(memoryStorage('a-cue-this-build-dropped'))).toBe(DEFAULT_NOTIFY_SOUND)
    const hostile: NotifySoundStorage = {
      getItem: () => { throw new Error('storage disabled') },
      setItem: () => { throw new Error('storage disabled') },
    }
    expect(readNotifySoundId(hostile)).toBe(DEFAULT_NOTIFY_SOUND)
  })

  it('swallows a refused write rather than failing the click', () => {
    const hostile: NotifySoundStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded') },
    }
    expect(() => { writeNotifySoundId(hostile, 'slide') }).not.toThrow()
    expect(() => { writeNotifySoundId(undefined, 'slide') }).not.toThrow()
  })
})

describe('browser-backed collaborators', () => {
  it('reports no storage outside a browser', () => {
    expect(browserNotifySoundStorage()).toBeUndefined()
  })

  it('plays the requested clip and swallows a rejected autoplay', async () => {
    const play = vi.fn(() => Promise.reject(new Error('autoplay blocked')))
    const constructed: string[] = []
    class FakeAudio {
      volume = 1
      readonly play = play
      constructor(readonly src: string) { constructed.push(src) }
    }
    vi.stubGlobal('Audio', FakeAudio)
    try {
      browserNotifySoundPlayer().play('portal')
      expect(constructed).toEqual(['/sounds/notify/portal.wav'])
      expect(play).toHaveBeenCalledOnce()
      await Promise.resolve()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('stays silent when constructing audio throws', () => {
    vi.stubGlobal('Audio', function FailingAudio(): never { throw new Error('no audio device') })
    try {
      expect(() => { browserNotifySoundPlayer().play('handoff') }).not.toThrow()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
