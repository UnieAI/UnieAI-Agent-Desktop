/**
 * The write half of the gateway: what leaves for `/auth/profile`, and what the
 * section is shown afterwards.
 *
 * Two properties carry the feature. The avatar's three fields travel together
 * or not at all, because an absent `image` is how the wire says "keep the
 * stored photo" — a name-only save that carried a MIME type would describe an
 * upload that is not there. And a stored change is followed by a re-read of
 * the account, so the section is shown what the product kept rather than what
 * the page submitted.
 */
import { describe, expect, it, vi } from 'vitest'
import { AccountGateway, type AccountGatewayEnvironment } from '../src/client/gateway.ts'
import { COPY } from '../src/client/locales.ts'

const STORED = {
  user: { id: 'u_1', name: 'Ada Lovelace', email: 'ada@unieai.com', avatarUrl: 'data:image/png;base64,NEW' },
  plan: { key: 'pro', name: 'Pro' },
  usage: {},
}

/** A host that answers `/auth/profile` and `/auth/account` independently. */
function host(answers: {
  profile?: unknown
  account?: unknown
  ok?: boolean
  status?: number
  throws?: boolean
}) {
  const calls: { path: string; method?: string; body?: unknown }[] = []
  const environment: AccountGatewayEnvironment = {
    request: (path, init) => {
      const record: { path: string; method?: string; body?: unknown } = { path }
      if (init?.method !== undefined) record.method = init.method
      if (typeof init?.body === 'string') record.body = JSON.parse(init.body) as unknown
      calls.push(record)
      if (answers.throws === true) return Promise.reject(new Error('offline'))
      const body = path === '/auth/profile' ? answers.profile : answers.account
      return Promise.resolve({
        ok: answers.ok ?? true,
        status: answers.status ?? (answers.ok === false ? 400 : 200),
        json: () => body === undefined ? Promise.reject(new Error('not json')) : Promise.resolve(body),
      } as Response)
    },
    navigate: vi.fn(),
    reload: vi.fn(),
  }
  return { environment, calls }
}

describe('AccountGateway saving a profile', () => {
  it('sends the name alone when no avatar was picked', async () => {
    const bench = host({ profile: { status: 'saved' }, account: { status: 'signed-in', snapshot: STORED } })
    const gateway = new AccountGateway(bench.environment, 'en')

    await expect(gateway.saveProfile({ displayName: 'Ada Lovelace' })).resolves.toEqual({ status: 'saved' })

    expect(bench.calls[0]).toEqual({
      path: '/auth/profile',
      method: 'POST',
      body: { name: 'Ada Lovelace' },
    })
  })

  it('sends the avatar with both of its identifications, or not at all', async () => {
    const bench = host({ profile: { status: 'saved' }, account: { status: 'signed-in', snapshot: STORED } })
    const gateway = new AccountGateway(bench.environment, 'en')

    await gateway.saveProfile({
      displayName: 'Ada Lovelace',
      avatar: { dataUrl: 'data:image/png;base64,NEW', mimeType: 'image/png', extension: '.png' },
    })

    expect(bench.calls[0]?.body).toEqual({
      name: 'Ada Lovelace',
      image: 'data:image/png;base64,NEW',
      imageMimeType: 'image/png',
      imageExtension: '.png',
    })
  })

  it('re-reads the account after a save, and publishes what was stored', async () => {
    const bench = host({ profile: { status: 'saved' }, account: { status: 'signed-in', snapshot: STORED } })
    const gateway = new AccountGateway(bench.environment, 'en')
    const listener = vi.fn()
    gateway.subscribe(listener)

    await gateway.saveProfile({ displayName: 'Ada Lovelace' })

    expect(bench.calls.map(call => call.path)).toEqual(['/auth/profile', '/auth/account'])
    expect(gateway.getSnapshot()).toEqual({
      status: 'signed-in',
      account: {
        identity: {
          displayName: 'Ada Lovelace',
          email: 'ada@unieai.com',
          avatarUrl: 'data:image/png;base64,NEW',
        },
        plan: { label: 'Pro' },
        usage: [],
      },
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('re-publishes when the photo changed and the name did not', async () => {
    const answers = {
      profile: { status: 'saved' },
      account: { status: 'signed-in', snapshot: { ...STORED, user: { ...STORED.user, avatarUrl: 'data:image/png;base64,OLD' } } },
    }
    const bench = host(answers)
    const gateway = new AccountGateway(bench.environment, 'en')
    await gateway.refresh()
    const listener = vi.fn()
    gateway.subscribe(listener)

    // Same name, new photo. The state must still move, or the header keeps
    // drawing the old one.
    answers.account = { status: 'signed-in', snapshot: STORED }
    await gateway.saveProfile({
      displayName: 'Ada Lovelace',
      avatar: { dataUrl: 'data:image/png;base64,NEW', mimeType: 'image/png', extension: '.png' },
    })

    expect(listener).toHaveBeenCalledTimes(1)
    const state = gateway.getSnapshot()
    expect(state.status === 'signed-in' && state.account.identity.avatarUrl)
      .toBe('data:image/png;base64,NEW')
  })

  it('reports a refusal without republishing the account it already had', async () => {
    const bench = host({ profile: { status: 'failed' }, account: { status: 'signed-in', snapshot: STORED } })
    const gateway = new AccountGateway(bench.environment, 'en')

    await expect(gateway.saveProfile({ displayName: '' })).resolves.toEqual({ status: 'failed' })
    expect(bench.calls.map(call => call.path)).toEqual(['/auth/profile'])
  })

  it('carries the reason the supplier named, so the form can say which refusal', async () => {
    const bench = host({ profile: { status: 'failed', reason: 'avatar-format' } })
    const gateway = new AccountGateway(bench.environment, 'en')
    await expect(gateway.saveProfile({ displayName: 'Ada' }))
      .resolves.toEqual({ status: 'failed', reason: 'avatar-format' })
  })

  it('reads the reason out of a 400 body too, which is where a rejected patch lands', async () => {
    const bench = host({ profile: { status: 'failed', reason: 'name-required' }, ok: false, status: 400 })
    const gateway = new AccountGateway(bench.environment, 'en')
    await expect(gateway.saveProfile({ displayName: ' ' }))
      .resolves.toEqual({ status: 'failed', reason: 'name-required' })
  })

  it('drops a reason this build has no line for, rather than printing an identifier', async () => {
    const bench = host({ profile: { status: 'failed', reason: 'quota-exhausted' } })
    const gateway = new AccountGateway(bench.environment, 'en')
    await expect(gateway.saveProfile({ displayName: 'Ada' })).resolves.toEqual({ status: 'failed' })
  })

  it('reports a body this build cannot read as a failure, not a save', async () => {
    const bench = host({ profile: { status: 'who knows' } })
    const gateway = new AccountGateway(bench.environment, 'en')
    await expect(gateway.saveProfile({ displayName: 'Ada' })).resolves.toEqual({ status: 'failed' })
  })

  it('reports an unreadable answer as a failure', async () => {
    const bench = host({})
    const gateway = new AccountGateway(bench.environment, 'en')
    await expect(gateway.saveProfile({ displayName: 'Ada' })).resolves.toEqual({ status: 'failed' })
  })

  it('reports a refusing host as a failure', async () => {
    const bench = host({ profile: { status: 'saved' }, ok: false })
    const gateway = new AccountGateway(bench.environment, 'en')
    await expect(gateway.saveProfile({ displayName: 'Ada' })).resolves.toEqual({ status: 'failed' })
  })

  it('reports an unreachable host as a failure', async () => {
    const bench = host({ throws: true })
    const gateway = new AccountGateway(bench.environment, 'en')
    await expect(gateway.saveProfile({ displayName: 'Ada' })).resolves.toEqual({ status: 'failed' })
    // The section's own copy still describes the standing state, unchanged.
    expect(COPY['en'].hostUnreachable).toBeTruthy()
  })

  it('answers signed-out from the host as a failure the form can report', async () => {
    const bench = host({ profile: { status: 'signed-out' } })
    const gateway = new AccountGateway(bench.environment, 'en')
    await expect(gateway.saveProfile({ displayName: 'Ada' })).resolves.toEqual({ status: 'failed' })
  })
})
