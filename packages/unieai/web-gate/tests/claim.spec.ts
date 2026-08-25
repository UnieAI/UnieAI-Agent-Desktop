/** Who this machine belongs to, and when it stops belonging to them. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { call, gate, product, request, signIn } from './gate-bench.ts'

afterEach(() => { vi.unstubAllGlobals() })

/**
 * @param userId - the account the product approves the next poll as.
 * @returns the stubbed product.
 */
function approving(userId: string) {
  return product({
    'POST /api/desktop/device/poll': {
      body: {
        status: 'approved',
        api_key: 'sk-test',
        user: { id: userId, name: userId, email: `${userId}@unieai.com` },
      },
    },
  })
}

/**
 * @param server - the captured route table.
 * @returns what the device poll answered.
 */
async function poll(server: ReturnType<typeof gate>['server']) {
  const res = await call(server.handler('/auth/device/poll'), request({}, { deviceCode: 'dc_1' }, 'POST'))
  return res.json() as { status: string; message?: string }
}

describe('first sign-in claims the machine', () => {
  it('refuses a second account while the first is still signed in', async () => {
    approving('u_first')
    const bench = gate()
    await bench.fiber.await()
    await signIn(bench.server)
    approving('u_second')
    expect(await poll(bench.server)).toEqual({
      status: 'error',
      message: 'This instance is already claimed by another account.',
    })
    await bench.fiber.dispose()
  })

  it('lets another account in after the last session signs out', async () => {
    // Signing out is a person saying they are done with this machine. Leaving
    // the claim standing meant their own next sign-in was refused as "another
    // account", and nothing short of restarting the Host could clear it.
    approving('u_first')
    const bench = gate()
    await bench.fiber.await()
    const cookie = await signIn(bench.server)
    await call(bench.server.handler('/auth/logout'), request({ cookie }, undefined, 'POST'))
    approving('u_second')
    expect(await poll(bench.server)).toEqual({ status: 'approved' })
    await bench.fiber.dispose()
  })

  it('keeps the claim while another browser is still signed in', async () => {
    // The release rides the same "last session" test the sign-out already drew
    // for the host session: one browser leaving is not the account leaving.
    approving('u_first')
    const bench = gate()
    await bench.fiber.await()
    const first = await signIn(bench.server)
    await signIn(bench.server)
    await call(bench.server.handler('/auth/logout'), request({ cookie: first }, undefined, 'POST'))
    approving('u_second')
    expect((await poll(bench.server)).status).toBe('error')
    await bench.fiber.dispose()
  })

  it('never releases a CONFIGURED allowlist, which is not a claim', async () => {
    // A deployment that names its accounts means them; no browser action widens it.
    approving('u_named')
    const bench = gate({ allowedUserIds: ['u_named'] })
    await bench.fiber.await()
    const cookie = await signIn(bench.server)
    await call(bench.server.handler('/auth/logout'), request({ cookie }, undefined, 'POST'))
    approving('u_stranger')
    expect((await poll(bench.server)).status).toBe('error')
    await bench.fiber.dispose()
  })
})
