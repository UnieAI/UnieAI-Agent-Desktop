/**
 * The data seam: the account source mirrors whatever gateway a composition
 * supplies, keeps snapshot identity stable between changes, and reports
 * `unavailable` — never a fabricated account — when no gateway exists.
 */
import { describe, expect, it, vi } from 'vitest'
import type { UnieAiAccountGateway, UnieAiAccountState } from '../src/account-contract.ts'
import { groupDigits, remainingPercent } from '../src/account-contract.ts'
import { AccountSource, UNAVAILABLE } from '../src/client/account-source.ts'

/** A gateway whose state the test drives by hand. */
function fakeGateway(initial: UnieAiAccountState) {
  let state = initial
  const listeners = new Set<() => void>()
  const gateway: UnieAiAccountGateway = {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    saveProfile: vi.fn(async () => ({ status: 'saved' as const })),
  }
  return {
    gateway,
    listenerCount: () => listeners.size,
    move: (next: UnieAiAccountState) => {
      state = next
      for (const listener of [...listeners]) listener()
    },
    /** Notify without moving the state (a gateway may republish redundantly). */
    republish: () => { for (const listener of [...listeners]) listener() },
  }
}

describe('AccountSource without a gateway', () => {
  it('reports unavailable and swallows both gestures', () => {
    const source = new AccountSource()
    expect(source.getSnapshot()).toEqual({ status: 'unavailable' })
    expect(source.getSnapshot()).toBe(UNAVAILABLE)
    expect(() => { source.signIn() }).not.toThrow()
    expect(() => { source.signOut() }).not.toThrow()
    expect(() => { source.dispose() }).not.toThrow()
  })

  it('reports a profile save as failed rather than as one that never left', async () => {
    const source = new AccountSource()
    await expect(source.saveProfile({ displayName: '林小明' })).resolves.toEqual({ status: 'failed' })
  })

  it('reports an invite as unsupported, which is not the same as one that failed', async () => {
    const source = new AccountSource()
    await expect(source.sendInvite('friend@example.com')).resolves.toEqual({ status: 'unsupported' })
  })

  it('never notifies, because nothing can move it', () => {
    const source = new AccountSource()
    const listener = vi.fn()
    const off = source.subscribe(listener)
    expect(source.getSnapshot()).toBe(UNAVAILABLE)
    off()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('AccountSource over a gateway', () => {
  it('forwards an invite to a gateway that offers the write, and reads it at call time', async () => {
    const bench = fakeGateway({ status: 'signed-out' })
    const source = new AccountSource()
    // The face the section holds is built once, before this gateway exists.
    await expect(source.sendInvite('friend@example.com')).resolves.toEqual({ status: 'unsupported' })

    const sendInvite = vi.fn(async () => ({ status: 'sent' as const }))
    source.attach({ ...bench.gateway, sendInvite })
    await expect(source.sendInvite('friend@example.com')).resolves.toEqual({ status: 'sent' })
    expect(sendInvite).toHaveBeenCalledWith('friend@example.com')
  })

  it('reports a supplier that exposes reads only as unsupported', async () => {
    const bench = fakeGateway({ status: 'signed-out' })
    const source = new AccountSource(bench.gateway)
    await expect(source.sendInvite('friend@example.com')).resolves.toEqual({ status: 'unsupported' })
  })

  it('adopts the initial state and every subsequent move', () => {
    const bench = fakeGateway({ status: 'signed-out' })
    const source = new AccountSource(bench.gateway)
    const listener = vi.fn()
    source.subscribe(listener)

    expect(source.getSnapshot()).toEqual({ status: 'signed-out' })
    const failed: UnieAiAccountState = { status: 'failed', message: '连不上 UnieAI。' }
    bench.move(failed)
    expect(source.getSnapshot()).toBe(failed)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('holds one reference while the state has not moved (uSES contract)', () => {
    const bench = fakeGateway({ status: 'signed-out' })
    const source = new AccountSource(bench.gateway)
    const listener = vi.fn()
    source.subscribe(listener)
    const first = source.getSnapshot()

    bench.republish()
    expect(source.getSnapshot()).toBe(first)
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifying an unsubscribed listener', () => {
    const bench = fakeGateway({ status: 'signed-out' })
    const source = new AccountSource(bench.gateway)
    const listener = vi.fn()
    const off = source.subscribe(listener)
    off()
    bench.move({ status: 'failed', message: 'nope' })
    expect(listener).not.toHaveBeenCalled()
    expect(source.getSnapshot()).toEqual({ status: 'failed', message: 'nope' })
  })

  it('forwards a profile save to the gateway, patch and verdict unchanged', async () => {
    const bench = fakeGateway({ status: 'signed-out' })
    const source = new AccountSource(bench.gateway)
    const patch = {
      displayName: '林大明',
      avatar: { dataUrl: 'data:image/png;base64,AAA', mimeType: 'image/png', extension: '.png' },
    }

    await expect(source.saveProfile(patch)).resolves.toEqual({ status: 'saved' })
    expect(bench.gateway.saveProfile).toHaveBeenCalledWith(patch)
  })

  it('forwards the two gestures and releases the gateway on dispose', () => {
    const bench = fakeGateway({ status: 'signed-out' })
    const source = new AccountSource(bench.gateway)
    source.signIn()
    source.signOut()
    expect(bench.gateway.signIn).toHaveBeenCalledTimes(1)
    expect(bench.gateway.signOut).toHaveBeenCalledTimes(1)

    expect(bench.listenerCount()).toBe(1)
    source.dispose()
    expect(bench.listenerCount()).toBe(0)
    // Idempotent: a second teardown (HMR re-entry) must not throw.
    expect(() => { source.dispose() }).not.toThrow()
  })
})

describe('quota arithmetic', () => {
  const quota = (used: number, limit: number | null) => ({ id: 'q', label: 'Q', used, limit })

  it('reports the unspent share, clamped to the window', () => {
    expect(remainingPercent(quota(0, 200))).toBe(100)
    expect(remainingPercent(quota(50, 200))).toBe(75)
    expect(remainingPercent(quota(200, 200))).toBe(0)
    // An overspent allowance reads as empty, never as a negative bar.
    expect(remainingPercent(quota(260, 200))).toBe(0)
  })

  it('has no percentage for an unmetered or degenerate allowance', () => {
    expect(remainingPercent(quota(10, null))).toBeNull()
    expect(remainingPercent(quota(10, 0))).toBeNull()
  })

  it('groups counts without depending on host Intl data', () => {
    expect(groupDigits(0)).toBe('0')
    expect(groupDigits(999)).toBe('999')
    expect(groupDigits(1000)).toBe('1,000')
    expect(groupDigits(1234567)).toBe('1,234,567')
    expect(groupDigits(-5)).toBe('0')
  })
})
