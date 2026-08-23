/**
 * The startup warm-up's own behaviour: what it gathers, what it keeps, what it
 * gives up on, and what it refuses to carry between accounts.
 *
 * The deadline and the cache lifetime are the two numbers this whole design
 * rests on, so they are driven here with fake readers and an injected clock
 * rather than through the route, where every case would have to spend real
 * seconds proving it.
 */
import { describe, expect, it, vi } from 'vitest'
import { BootstrapWarmup, type BootstrapPart } from '../src/bootstrap.ts'

const ADA = { userId: 'u_1', apiKey: 'sk-ada' }
const BOB = { userId: 'u_2', apiKey: 'sk-bob' }

/** Readers that answer immediately, each naming its own part. */
function instant() {
  const calls: string[] = []
  const reader = (part: BootstrapPart) => (apiKey: string) => {
    calls.push(`${part}:${apiKey}`)
    return Promise.resolve({ status: 'signed-in', part })
  }
  return {
    calls,
    readers: {
      account: reader('account'),
      providers: reader('providers'),
      models: reader('models'),
      mcp: reader('mcp'),
    },
  }
}

/** One reader a suite resolves by hand, so a slow product can be held open. */
function held() {
  let release: (body: unknown) => void = () => {}
  const promise = new Promise<unknown>((resolve) => { release = resolve })
  return { release, read: () => promise }
}

/**
 * A warm-up over the given readers.
 * @param readers - the four part readers.
 * @param now - injected clock, for the cache lifetime.
 * @returns the warm-up.
 */
function warmup(
  readers: Record<BootstrapPart, (apiKey: string, signal: AbortSignal) => Promise<unknown>>,
  now?: () => number,
): BootstrapWarmup {
  return new BootstrapWarmup({
    readers,
    ttlMs: 30_000,
    upstreamTimeoutMs: 15_000,
    ...(now === undefined ? {} : { now }),
  })
}

describe('startup warm-up', () => {
  it('gathers every part in one pass and reports it ready', async () => {
    const fake = instant()
    const answer = await warmup(fake.readers).read(ADA, 1000)

    expect(answer.status).toBe('ready')
    expect(answer.pending).toEqual([])
    expect(answer.parts).toEqual({
      account: { status: 'signed-in', part: 'account' },
      providers: { status: 'signed-in', part: 'providers' },
      models: { status: 'signed-in', part: 'models' },
      mcp: { status: 'signed-in', part: 'mcp' },
    })
    expect(fake.calls).toEqual(['account:sk-ada', 'providers:sk-ada', 'models:sk-ada', 'mcp:sk-ada'])
  })

  it('answers a read that arrives after a warm from memory, without gathering twice', async () => {
    const fake = instant()
    const warm = warmup(fake.readers)
    warm.warm(ADA)
    await Promise.resolve()
    const answer = await warm.read(ADA, 1000)

    expect(answer.status).toBe('ready')
    expect(fake.calls.length).toBe(4)
  })

  it('gives up on a part that has not landed, and names it', async () => {
    const slow = held()
    const fake = instant()
    const answer = await warmup({ ...fake.readers, mcp: slow.read }).read(ADA, 20)

    expect(answer.status).toBe('partial')
    expect(answer.pending).toEqual(['mcp'])
    expect(Object.keys(answer.parts)).toEqual(['account', 'providers', 'models'])
    slow.release({ status: 'signed-in' })
  })

  it('keeps gathering a part the deadline passed on, so the next read has it', async () => {
    const slow = held()
    const fake = instant()
    const warm = warmup({ ...fake.readers, mcp: slow.read })
    expect((await warm.read(ADA, 20)).pending).toEqual(['mcp'])

    slow.release({ status: 'signed-in', part: 'mcp' })
    await vi.waitUntil(async () => (await warm.read(ADA, 20)).status === 'ready')

    expect((await warm.read(ADA, 20)).parts.mcp).toEqual({ status: 'signed-in', part: 'mcp' })
    // Three, not six: the parts that landed the first time were not read again.
    expect(fake.calls.length).toBe(3)
  })

  it('answers from the previous gather while a stale one refreshes behind it', async () => {
    const fake = instant()
    let clock = 1_000_000
    const warm = warmup(fake.readers, () => clock)
    await warm.read(ADA, 1000)
    clock += 60_000

    const answer = await warm.read(ADA, 1000)

    expect(answer.status).toBe('ready')
    // The stale copy answered this read; the refresh it started runs behind it.
    await vi.waitUntil(() => fake.calls.length === 8)
  })

  it('never hands one account what was gathered for another', async () => {
    const fake = instant()
    const warm = warmup(fake.readers)
    await warm.read(ADA, 1000)

    const answer = await warm.read(BOB, 1000)

    expect(answer.parts).toEqual({
      account: { status: 'signed-in', part: 'account' },
      providers: { status: 'signed-in', part: 'providers' },
      models: { status: 'signed-in', part: 'models' },
      mcp: { status: 'signed-in', part: 'mcp' },
    })
    expect(fake.calls.filter(call => call.endsWith('sk-bob')).length).toBe(4)
  })

  it('forgets what it gathered when the last session goes', async () => {
    const fake = instant()
    const warm = warmup(fake.readers)
    await warm.read(ADA, 1000)

    warm.forget()
    await warm.read(ADA, 1000)

    expect(fake.calls.length).toBe(8)
  })

  it('leaves a part absent when its reader throws, rather than carrying the throw', async () => {
    const fake = instant()
    const answer = await warmup({
      ...fake.readers,
      providers: () => Promise.reject(new Error('socket closed')),
    }).read(ADA, 1000)

    expect(answer.status).toBe('partial')
    expect(answer.pending).toEqual(['providers'])
    expect(answer.parts.account).toBeDefined()
  })

  it('cancels the in-flight reads it is disposed under', async () => {
    const aborted: boolean[] = []
    const fake = instant()
    const warm = warmup({
      ...fake.readers,
      mcp: (_apiKey, signal) => new Promise((resolve) => {
        signal.addEventListener('abort', () => { aborted.push(true); resolve(undefined) })
      }),
    })
    warm.warm(ADA)
    await Promise.resolve()

    warm.dispose()

    expect(aborted).toEqual([true])
  })

  it('does nothing when warmed after disposal', () => {
    const fake = instant()
    const warm = warmup(fake.readers)
    warm.dispose()

    warm.warm(ADA)

    expect(fake.calls).toEqual([])
  })
})
