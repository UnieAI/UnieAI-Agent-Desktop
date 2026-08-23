/**
 * The mapping: what the section is told about an account, and — more
 * importantly — what it is not told. A meter the product left out is absent
 * rather than zero, an unmetered allowance stays unmetered, a reset time that
 * never arrived produces no line, and the activity strip and invite card stay
 * empty because the product reports neither.
 */
import { describe, expect, it } from 'vitest'
import type { LocaleId } from '@unieai/uad-client-locale/client'
import type { HostAccountSnapshot } from '../src/client/host-account.ts'
import { formatResetTime, mapAccount, projectState } from '../src/client/account-mapping.ts'
import { COPY, METER_KEYS } from '../src/client/locales.ts'

const RESET = '2026-08-23T04:05:00.000Z'

/** One meter, with the window length the wire uses for "unreported". */
const meter = (used: number, limit: number | null, resetAt = RESET, windowHours = 0) =>
  ({ used, limit, resetAt, windowHours })

function snapshotOf(usage: HostAccountSnapshot['usage']): HostAccountSnapshot {
  return {
    user: { id: 'u_1', name: 'Ada Lovelace', email: 'ada@unieai.com' },
    plan: { key: 'pro', name: 'Pro' },
    usage,
  }
}

/** The reset time as the reader's own clock renders it. */
const localReset = (): string => {
  const when = new Date(RESET)
  const pad = (value: number): string => value.toString().padStart(2, '0')
  return `${String(when.getFullYear())}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
    + ` ${pad(when.getHours())}:${pad(when.getMinutes())}`
}

describe('mapAccount', () => {
  it('lists the reported allowances in the usage list order, and no others', () => {
    const account = mapAccount(snapshotOf({
      // Deliberately out of order, and missing four of the seven meters.
      chatTokens: { used: 1_200, limit: 100_000, resetAt: RESET, windowHours: 0 },
      agentTurns: { used: 3, limit: 50, resetAt: RESET, windowHours: 0 },
      toolCalls: { used: 9, limit: null, resetAt: '', windowHours: 0 },
    }), 'en')
    expect(account.usage.map(quota => quota.id)).toEqual(['agent-turns', 'chat-tokens', 'tool-calls'])
  })

  it('omits a meter the product did not report, rather than showing it as zero', () => {
    const account = mapAccount(snapshotOf({ agentTurns: { used: 3, limit: 50, resetAt: RESET, windowHours: 0 } }), 'en')
    expect(account.usage).toHaveLength(1)
    expect(account.usage.find(quota => quota.id === 'vlm-pages')).toBeUndefined()
  })

  it('carries an unmetered allowance through as null, never as a number', () => {
    const account = mapAccount(snapshotOf({ agentTokens: meter(4_096, null) }), 'en')
    expect(account.usage[0]).toEqual({
      id: 'agent-tokens',
      label: 'Agent tokens',
      used: 4_096,
      limit: null,
      resetsAt: localReset(),
    })
  })

  it('carries a reported window length, and drops the wire zero that means none', () => {
    const windowed = mapAccount(snapshotOf({ chatTokens: meter(1, 2, RESET, 5) }), 'en')
    expect(windowed.usage[0]?.windowHours).toBe(5)

    const silent = mapAccount(snapshotOf({ chatTokens: meter(1, 2) }), 'en')
    expect(silent.usage[0]).not.toHaveProperty('windowHours')
  })

  it('formats a reported reset time in local time and omits an absent one', () => {
    const reported = mapAccount(snapshotOf({ mcpCalls: { used: 1, limit: 10, resetAt: RESET, windowHours: 0 } }), 'en')
    expect(reported.usage[0]?.resetsAt).toBe(localReset())

    const silent = mapAccount(snapshotOf({ mcpCalls: { used: 1, limit: 10, resetAt: '', windowHours: 0 } }), 'en')
    expect(silent.usage[0]).not.toHaveProperty('resetsAt')
  })

  it('drops a meter key this build has no words for', () => {
    const account = mapAccount(snapshotOf({ voiceMinutes: { used: 5, limit: 60, resetAt: RESET, windowHours: 0 } }), 'en')
    expect(account.usage).toEqual([])
  })

  it('names every allowance in the reader language', () => {
    const usage = Object.fromEntries(METER_KEYS.map(key => [key, { used: 1, limit: 2, resetAt: '', windowHours: 0 }]))
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ja'] satisfies LocaleId[]) {
      const account = mapAccount(snapshotOf(usage), locale)
      expect(account.usage.map(quota => quota.label))
        .toEqual(METER_KEYS.map(key => COPY[locale].meters[key]))
    }
  })

  it('reports the plan label the product chose', () => {
    expect(mapAccount(snapshotOf({}), 'en').plan.label).toBe('Pro')
  })

  it('shows an unreported plan as unknown, never as a free tier', () => {
    expect(mapAccount({ ...snapshotOf({}), plan: null }, 'en').plan.label).toBe('—')
  })

  it('falls back to the sign-in address when the account set no name', () => {
    const named = mapAccount(snapshotOf({}), 'en')
    expect(named.identity).toEqual({ displayName: 'Ada Lovelace', email: 'ada@unieai.com' })

    const blank = mapAccount({
      ...snapshotOf({}),
      user: { id: 'u_1', name: '  ', email: 'ada@unieai.com' },
    }, 'en')
    expect(blank.identity.displayName).toBe('ada@unieai.com')

    const anonymous = mapAccount({
      ...snapshotOf({}),
      user: { id: 'u_1', name: null, email: 'ada@unieai.com' },
    }, 'en')
    expect(anonymous.identity.displayName).toBe('ada@unieai.com')
  })

  it('invents no avatar, activity, or invite standing', () => {
    const account = mapAccount(snapshotOf({ agentTurns: meter(1, 2) }), 'en')
    expect(account).not.toHaveProperty('activity')
    expect(account).not.toHaveProperty('invites')
    expect(account.identity).not.toHaveProperty('avatarUrl')
    // The handle the contract used to carry is gone entirely: the product has
    // no such column, and the address was standing in for it.
    expect(account.identity).not.toHaveProperty('handle')
  })
})

describe('mapAccount activity', () => {
  const withStats = (stats: HostAccountSnapshot['stats']): HostAccountSnapshot =>
    ({ ...snapshotOf({}), ...(stats === undefined ? {} : { stats }) })

  it('formats each of the five in its own unit, because they differ', () => {
    const account = mapAccount(withStats({
      totalTokens: 1_204_567,
      peakDayTokens: 90_120,
      longestTaskMinutes: 125,
      currentStreakDays: 3,
      longestStreakDays: 41,
      daily: [{ date: '2026-08-20', tokens: 12 }],
    }), 'en')
    expect(account.activity?.stats).toEqual({
      'total-tokens': '1,204,567',
      'peak-tokens': '90,120',
      'longest-task': '2h 5m',
      'current-streak': '3d',
      'longest-streak': '41d',
    })
    expect(account.activity?.daily).toEqual([{ date: '2026-08-20', tokens: 12 }])
  })

  it('reads the three unit suffixes in the reader language', () => {
    const stats = {
      longestTaskMinutes: 60,
      currentStreakDays: 2,
      daily: [],
    }
    for (const locale of ['en', 'zh-CN', 'zh-TW', 'ja'] satisfies LocaleId[]) {
      const units = COPY[locale].units
      const account = mapAccount(withStats(stats), locale)
      expect(account.activity?.stats['longest-task']).toBe(`1${units.hour} 0${units.minute}`)
      expect(account.activity?.stats['current-streak']).toBe(`2${units.day}`)
    }
  })

  it('leaves a figure the product did not report absent, never at zero', () => {
    const account = mapAccount(withStats({ totalTokens: 12, daily: [] }), 'en')
    expect(account.activity?.stats).toEqual({ 'total-tokens': '12' })
    expect(account.activity?.stats).not.toHaveProperty('peak-tokens')
  })

  it('reports a zero the product DID report, because that is a fact', () => {
    const account = mapAccount(withStats({ currentStreakDays: 0, daily: [] }), 'en')
    expect(account.activity?.stats['current-streak']).toBe('0d')
  })

  it('omits the whole strip when the product reported no figures at all', () => {
    expect(mapAccount(withStats(undefined), 'en')).not.toHaveProperty('activity')
  })
})

describe('mapAccount invites', () => {
  it('publishes the balance and the count the host reported', () => {
    const account = mapAccount({ ...snapshotOf({}), inviteCredits: 3, inviteCount: 7 }, 'en')
    expect(account.invites).toEqual({ credits: 3, sentCount: 7 })
  })

  it('names each listed invite state in the reader language, and formats its date', () => {
    const account = mapAccount({
      ...snapshotOf({}),
      inviteCount: 2,
      invites: [
        { inviteeEmail: 'a@x.test', status: 'joined', createdAt: RESET, inviteUrl: 'https://u.test/invite/ref/a1' },
        { inviteeEmail: 'b@x.test', status: 'somethingNew', createdAt: '', inviteUrl: '' },
      ],
    }, 'ja')
    expect(account.invites?.sent?.[0]).toEqual({
      inviteeEmail: 'a@x.test',
      status: COPY['ja'].inviteStates.joined,
      sentAt: localReset(),
      url: 'https://u.test/invite/ref/a1',
    })
    // A state this build has no words for is dropped rather than printed as an
    // English enum member at a Japanese reader.
    expect(account.invites?.sent?.[1]).toEqual({ inviteeEmail: 'b@x.test' })
  })

  it('omits the standing entirely when no part of it was reported', () => {
    expect(mapAccount(snapshotOf({}), 'en')).not.toHaveProperty('invites')
  })
})

describe('formatResetTime', () => {
  it('refuses a timestamp that is not one', () => {
    expect(formatResetTime('')).toBeUndefined()
    expect(formatResetTime('soon')).toBeUndefined()
  })

  it('pads every field to a fixed width', () => {
    expect(formatResetTime(new Date(2026, 0, 2, 3, 4).toISOString())).toBe('2026-01-02 03:04')
  })
})

describe('projectState', () => {
  it('opens signed-out, because a gateway exists and a session may not', () => {
    expect(projectState(undefined, 'en')).toEqual({ status: 'signed-out' })
    expect(projectState({ status: 'signed-out' }, 'en')).toEqual({ status: 'signed-out' })
  })

  it('separates a product that would not answer from a host that did not', () => {
    expect(projectState({ status: 'failed' }, 'ja'))
      .toEqual({ status: 'failed', message: COPY['ja'].productUnavailable })
    expect(projectState({ status: 'unreachable' }, 'ja'))
      .toEqual({ status: 'failed', message: COPY['ja'].hostUnreachable })
  })

  it('carries a signed-in reading through the mapping', () => {
    const state = projectState({ status: 'signed-in', snapshot: snapshotOf({}) }, 'zh-TW')
    expect(state).toMatchObject({ status: 'signed-in', account: { plan: { label: 'Pro' } } })
  })
})
