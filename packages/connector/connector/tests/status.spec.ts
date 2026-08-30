// What `list()` says about a connector before anyone presses anything. The
// rule under test is the one that decides whether a button can work: a
// provider whose endpoints are written down needs an application registered
// with the vendor, and a page that offered to connect it anyway would fail
// for a reason nobody could act on.

import { Context } from '@unieai/cordis'
import { describe, expect, it } from 'vitest'
import { CredentialProvider } from '@unieai/uad-credentials'
import type {
  CredentialInfo, CredentialRecord, CredentialRecordEntry, CredentialRecordInfo, ResolvedCredential,
} from '@unieai/uad-credentials'
import { Connectors } from '../src/index.ts'
import { GOOGLE_AUTH } from '../src/providers.ts'
import type { ConnectorProvider } from '../src/types.ts'

/** A credential store holding nothing, because nothing here is connected. */
class EmptyCredentials extends CredentialProvider {
  resolve(): Promise<ResolvedCredential | undefined> { return Promise.resolve(undefined) }
  describe(): Promise<CredentialInfo> { return Promise.resolve({ configured: false, writable: true }) }
  set(): Promise<void> { return Promise.resolve() }
  unset(): Promise<void> { return Promise.resolve() }
  readRecord(): Promise<CredentialRecord | undefined> { return Promise.resolve(undefined) }
  describeRecord(): Promise<CredentialRecordInfo> { return Promise.resolve({ configured: false, writable: true }) }
  listRecords(): Promise<readonly CredentialRecordEntry[]> { return Promise.resolve([]) }
  modifyRecord(
    _key: unknown,
    mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>,
  ): Promise<CredentialRecord | undefined> { return mutate(undefined) }
  deleteRecord(): Promise<void> { return Promise.resolve() }
}

/** A provider that registers clients on demand, stated as URLs. */
const SELF_REGISTERING: ConnectorProvider = {
  id: 'self',
  label: 'Self',
  auth: {
    kind: 'oauth2',
    authorizationUrl: 'https://s.example/authorize',
    tokenUrl: 'https://s.example/token',
    registrationUrl: 'https://s.example/register',
  },
  scopes: [],
}

/** A provider named by issuer, whose registration endpoint is a network fact. */
const DISCOVERED: ConnectorProvider = {
  id: 'discovered',
  label: 'Discovered',
  auth: { kind: 'discovered', issuer: 'https://d.example' },
  scopes: [],
}

/** A provider whose endpoints are written down and issues no clients. */
const REGISTERED: ConnectorProvider = { id: 'google', label: 'Google', auth: GOOGLE_AUTH, scopes: ['openid'] }

/**
 * A book offering the three provider kinds.
 * @param clientIds - the ids this deployment was given.
 * @returns the mounted service.
 */
async function book(clientIds?: Record<string, string>): Promise<Connectors> {
  const ctx = new Context()
  await ctx.plugin(EmptyCredentials)
  const connectors = new Connectors(ctx, clientIds === undefined ? {} : { clientIds })
  for (const provider of [SELF_REGISTERING, DISCOVERED, REGISTERED]) connectors.register(provider)
  return connectors
}

describe('what a connector says about itself before it is connected', () => {
  it('marks only the one that needs an application registered with the vendor', async () => {
    const listed = await (await book()).list()
    expect(listed.map(entry => [entry.id, entry.requiresClientId]))
      .toEqual([['self', false], ['discovered', false], ['google', true]])
  })

  it('clears the mark once the deployment has been given that id', async () => {
    const listed = await (await book({ google: 'client-123.apps.googleusercontent.com' })).list()
    expect(listed.find(entry => entry.id === 'google')?.requiresClientId).toBe(false)
  })

  it('treats a blank id as no id, because an empty string configures nothing', async () => {
    const listed = await (await book({ google: '' })).list()
    expect(listed.find(entry => entry.id === 'google')?.requiresClientId).toBe(true)
  })

  it('refuses to describe a connector nobody offered', async () => {
    await expect((await book()).status('nope')).rejects.toThrow('no connector is offered as nope')
  })
})
