/**
 * The wire boundary: what this build will and will not believe about a
 * `/auth/account` body. A body it cannot read must come back as undefined, so
 * the gateway reports a failure rather than an account with nothing in it.
 */
import { describe, expect, it } from 'vitest'
import { readAccountResponse } from '../src/client/host-account.ts'

const snapshot = {
  user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' },
  plan: { key: 'pro', name: 'Pro' },
  usage: { agentTurns: { used: 3, limit: 50, resetAt: '2026-08-23T00:00:00.000Z', windowHours: 5 } },
}

describe('readAccountResponse', () => {
  it('reads the signed-out answer', () => {
    expect(readAccountResponse({ status: 'signed-out' })).toEqual({ status: 'signed-out' })
  })

  it('reads the failed answer and drops the host diagnostic', () => {
    expect(readAccountResponse({ status: 'failed', message: 'The UnieAI account could not be read.' }))
      .toEqual({ status: 'failed' })
  })

  it('reads a signed-in answer whole', () => {
    expect(readAccountResponse({ status: 'signed-in', snapshot })).toEqual({
      status: 'signed-in',
      snapshot: {
        user: { id: 'u_1', name: 'Ada', email: 'ada@unieai.com' },
        plan: { key: 'pro', name: 'Pro' },
        usage: {
          agentTurns: { used: 3, limit: 50, resetAt: '2026-08-23T00:00:00.000Z', windowHours: 5 },
        },
      },
    })
  })

  it('reads an unreported window length as the wire zero, not as a window', () => {
    const answer = readAccountResponse({
      status: 'signed-in',
      snapshot: { ...snapshot, usage: { chatTokens: { used: 12, limit: 20, resetAt: '' } } },
    })
    expect(answer).toMatchObject({ snapshot: { usage: { chatTokens: { windowHours: 0 } } } })
  })

  it('reads the referral balance and count, and leaves an unreported one absent', () => {
    const reported = readAccountResponse({
      status: 'signed-in',
      snapshot: { ...snapshot, inviteCredits: 2, inviteCount: 5 },
    })
    expect(reported).toMatchObject({ snapshot: { inviteCredits: 2, inviteCount: 5 } })

    const silent = readAccountResponse({ status: 'signed-in', snapshot })
    expect(silent).toMatchObject({ status: 'signed-in' })
    const read = silent?.status === 'signed-in' ? silent.snapshot : undefined
    expect(read).not.toHaveProperty('inviteCredits')
    expect(read).not.toHaveProperty('inviteCount')
  })

  it('reads the listed invites, and drops a row that names nobody', () => {
    const answer = readAccountResponse({
      status: 'signed-in',
      snapshot: {
        ...snapshot,
        invites: [
          { inviteeEmail: 'a@x.test', status: 'pending', createdAt: '2026-08-01T00:00:00.000Z', inviteUrl: 'https://u.test/i/1' },
          { status: 'pending' },
          'not a row',
        ],
      },
    })
    expect(answer).toMatchObject({
      snapshot: {
        invites: [{
          inviteeEmail: 'a@x.test',
          status: 'pending',
          createdAt: '2026-08-01T00:00:00.000Z',
          inviteUrl: 'https://u.test/i/1',
        }],
      },
    })
  })

  it('reads the activity figures, dropping any that is not a number', () => {
    const answer = readAccountResponse({
      status: 'signed-in',
      snapshot: {
        ...snapshot,
        stats: {
          totalTokens: 10,
          peakDayTokens: 'lots',
          currentStreakDays: 0,
          daily: [
            { date: '2026-08-20', tokens: 4 },
            { date: '', tokens: 9 },
            { date: '2026-08-21', tokens: 'many' },
          ],
        },
      },
    })
    const stats = answer?.status === 'signed-in' ? answer.snapshot.stats : undefined
    expect(stats).toEqual({
      totalTokens: 10,
      // Reported as zero, so carried as zero: an unreported figure and a
      // reported nothing are different facts.
      currentStreakDays: 0,
      daily: [{ date: '2026-08-20', tokens: 4 }],
    })
  })

  it('leaves the activity absent when the host reported none', () => {
    const answer = readAccountResponse({ status: 'signed-in', snapshot })
    expect(answer?.status === 'signed-in' ? answer.snapshot : undefined).not.toHaveProperty('stats')
  })

  it('keeps an unmetered allowance unmetered rather than zeroing it', () => {
    const answer = readAccountResponse({
      status: 'signed-in',
      snapshot: { ...snapshot, usage: { chatTokens: { used: 12, limit: null, resetAt: '', windowHours: 0 } } },
    })
    expect(answer).toMatchObject({ snapshot: { usage: { chatTokens: { limit: null } } } })
  })

  it('reads a limit the product left out as unmetered, not as zero', () => {
    const answer = readAccountResponse({
      status: 'signed-in',
      snapshot: { ...snapshot, usage: { chatTokens: { used: 12 } } },
    })
    expect(answer).toMatchObject({ snapshot: { usage: { chatTokens: { limit: null, resetAt: '' } } } })
  })

  it('drops a meter that reports no count', () => {
    const answer = readAccountResponse({
      status: 'signed-in',
      snapshot: { ...snapshot, usage: { chatTokens: { limit: 10 }, mcpCalls: 7 } },
    })
    expect(answer).toMatchObject({ snapshot: { usage: {} } })
  })

  it('reports no plan rather than an empty one', () => {
    const answer = readAccountResponse({ status: 'signed-in', snapshot: { ...snapshot, plan: null } })
    expect(answer).toMatchObject({ snapshot: { plan: null } })
  })

  it('keeps a null display name null', () => {
    const answer = readAccountResponse({
      status: 'signed-in',
      snapshot: { ...snapshot, user: { id: 'u_1', name: null, email: 'ada@unieai.com' } },
    })
    expect(answer).toMatchObject({ snapshot: { user: { name: null, email: 'ada@unieai.com' } } })
  })

  it('carries the avatar the product stores, and leaves an unstated one absent', () => {
    const withPhoto = readAccountResponse({
      status: 'signed-in',
      snapshot: { ...snapshot, user: { ...snapshot.user, avatarUrl: 'data:image/png;base64,AAA' } },
    })
    expect(withPhoto).toMatchObject({ snapshot: { user: { avatarUrl: 'data:image/png;base64,AAA' } } })

    // Absent and empty must both mean "no photo": an empty `src` renders as a
    // broken image, which is not what an account without an avatar looks like.
    for (const avatarUrl of [undefined, '', 42]) {
      const answer = readAccountResponse({
        status: 'signed-in',
        snapshot: { ...snapshot, user: { ...snapshot.user, avatarUrl } },
      })
      expect(answer).toMatchObject({ status: 'signed-in' })
      expect(answer?.status === 'signed-in' && 'avatarUrl' in answer.snapshot.user).toBe(false)
    }
  })

  it('tolerates a snapshot with no usage section', () => {
    const answer = readAccountResponse({
      status: 'signed-in',
      snapshot: { user: snapshot.user, plan: snapshot.plan },
    })
    expect(answer).toMatchObject({ snapshot: { usage: {} } })
  })

  it('refuses a signed-in answer that names no account', () => {
    expect(readAccountResponse({ status: 'signed-in', snapshot: { user: { email: 'a@b' } } })).toBeUndefined()
    expect(readAccountResponse({ status: 'signed-in', snapshot: { user: 'ada' } })).toBeUndefined()
    expect(readAccountResponse({ status: 'signed-in' })).toBeUndefined()
  })

  it('refuses anything that is not one of the three answers', () => {
    expect(readAccountResponse(undefined)).toBeUndefined()
    expect(readAccountResponse(null)).toBeUndefined()
    expect(readAccountResponse('signed-out')).toBeUndefined()
    expect(readAccountResponse({ status: 'pending' })).toBeUndefined()
  })
})
