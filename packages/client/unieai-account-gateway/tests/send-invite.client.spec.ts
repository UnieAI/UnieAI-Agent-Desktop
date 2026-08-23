/**
 * The invite write: what leaves for `/auth/invite`, what comes back, and what
 * the section is told about it.
 *
 * The properties that carry the feature: a refusal arrives as the product's
 * own identifier and is translated once, here, into the section's vocabulary;
 * a host that has no invite route at all is reported as a deployment that
 * cannot send rather than as a send that failed; and an invite that went out
 * is followed by a re-read, because the count the card shows is the product's.
 */
import { describe, expect, it, vi } from 'vitest'
import { AccountGateway, type AccountGatewayEnvironment } from '../src/client/gateway.ts'

const SNAPSHOT = {
  user: { id: 'u_1', name: 'Ada Lovelace', email: 'ada@unieai.com' },
  plan: { key: 'pro', name: 'Pro' },
  usage: {},
  inviteCredits: 2,
  inviteCount: 4,
}

/** A host that answers `/auth/invite` and `/auth/account` independently. */
function host(answers: { invite?: unknown; account?: unknown; status?: number; throws?: boolean }) {
  const calls: { path: string; method?: string; body?: unknown }[] = []
  const environment: AccountGatewayEnvironment = {
    request: (path, init) => {
      const record: { path: string; method?: string; body?: unknown } = { path }
      if (init?.method !== undefined) record.method = init.method
      if (typeof init?.body === 'string') record.body = JSON.parse(init.body) as unknown
      calls.push(record)
      if (answers.throws === true) return Promise.reject(new Error('offline'))
      const invite = path === '/auth/invite'
      const body = invite ? answers.invite : answers.account
      const status = invite ? answers.status ?? 200 : 200
      return Promise.resolve({
        ok: status < 400,
        status,
        json: () => body === undefined ? Promise.reject(new Error('not json')) : Promise.resolve(body),
      } as Response)
    },
    navigate: vi.fn(),
    reload: vi.fn(),
  }
  return { environment, calls }
}

describe('AccountGateway sending an invite', () => {
  it('posts the address, and re-reads the account the invite changed', async () => {
    const bench = host({
      invite: { status: 'sent', url: 'https://u.test/invite/ref/abc' },
      account: { status: 'signed-in', snapshot: SNAPSHOT },
    })
    const gateway = new AccountGateway(bench.environment, 'en')

    await expect(gateway.sendInvite('friend@x.test'))
      .resolves.toEqual({ status: 'sent', url: 'https://u.test/invite/ref/abc' })

    expect(bench.calls[0]).toEqual({
      path: '/auth/invite',
      method: 'POST',
      body: { email: 'friend@x.test' },
    })
    expect(bench.calls.map(call => call.path)).toEqual(['/auth/invite', '/auth/account'])
    const state = gateway.getSnapshot()
    expect(state.status === 'signed-in' && state.account.invites)
      .toEqual({ credits: 2, sentCount: 4 })
  })

  it('translates each product refusal into the one the section has words for', async () => {
    const pairs = [
      ['invalid_email', 'invalid-email'],
      ['self_invite', 'self-invite'],
      ['already_invited', 'already-invited'],
    ] as const
    for (const [reported, expected] of pairs) {
      const bench = host({ invite: { status: 'refused', reason: reported } })
      const gateway = new AccountGateway(bench.environment, 'en')
      await expect(gateway.sendInvite('friend@x.test'))
        .resolves.toEqual({ status: 'refused', reason: expected })
      // A refusal republishes nothing: the account did not change.
      expect(bench.calls.map(call => call.path)).toEqual(['/auth/invite'])
    }
  })

  it('reports a refusal this build cannot name as a plain failure', async () => {
    const bench = host({ invite: { status: 'refused', reason: 'domain_blocked' } })
    const gateway = new AccountGateway(bench.environment, 'en')
    await expect(gateway.sendInvite('friend@x.test')).resolves.toEqual({ status: 'failed' })
  })

  it('separates a host with no invite route from a send that failed', async () => {
    for (const status of [404, 501]) {
      const bench = host({ status, invite: 'Not found' })
      const gateway = new AccountGateway(bench.environment, 'en')
      await expect(gateway.sendInvite('friend@x.test')).resolves.toEqual({ status: 'unsupported' })
    }
  })

  it('reports an unreachable host, an unreadable body, and a signed-out session as failures', async () => {
    const offline = new AccountGateway(host({ throws: true }).environment, 'en')
    await expect(offline.sendInvite('friend@x.test')).resolves.toEqual({ status: 'failed' })

    const garbled = new AccountGateway(host({ invite: { status: 'who knows' } }).environment, 'en')
    await expect(garbled.sendInvite('friend@x.test')).resolves.toEqual({ status: 'failed' })

    const signedOut = new AccountGateway(host({ invite: { status: 'signed-out' } }).environment, 'en')
    await expect(signedOut.sendInvite('friend@x.test')).resolves.toEqual({ status: 'failed' })
  })

  it('omits a link the host did not report rather than sending an empty one', async () => {
    const bench = host({
      invite: { status: 'sent' },
      account: { status: 'signed-in', snapshot: SNAPSHOT },
    })
    const gateway = new AccountGateway(bench.environment, 'en')
    await expect(gateway.sendInvite('friend@x.test')).resolves.toEqual({ status: 'sent' })
  })
})
