// @vitest-environment jsdom
/**
 * The browser half on a real SlotRegistry and a real LocaleRuntime: the page
 * registers into the settings shell's section slot once that slot exists, its
 * nav label and its dates follow the active locale, and every gesture on the
 * injected face reaches the host route it names.
 */
import { Context } from '@unieai/cordis'
import { describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@unieai/uad-client-locale/client'
import { SlotRegistry } from '@unieai/uad-client-runtime/client'
import { apply, inject, NS } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import { ConnectorsSection } from '../src/client/ConnectorsSection.tsx'
import type { ConnectorsSectionInjected } from '../src/client/ConnectorsSection.tsx'

const SLOT = 'settings.section'

/** Stand in for the settings shell: declare the section slot from root. */
function declareSections(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

/**
 * A connection whose host calls this suite records and answers by hand.
 * @param refuse - answer every call with this message instead of a value.
 */
function fakeConnection(refuse = '') {
  const calls: { method: string; payload: unknown }[] = []
  const answer = <T,>(method: string, value: T) => (payload: unknown) => {
    calls.push({ method, payload })
    if (refuse !== '') {
      return Promise.resolve({
        rpcId: 'r',
        result: { ok: false as const, error: { code: 'internal', message: refuse, details: {} } },
      })
    }
    return Promise.resolve({ rpcId: 'r', result: { ok: true as const, value } })
  }
  return {
    calls,
    handle: {
      api: {
        host: {
          listConnectors: answer('listConnectors', {
            connectors: [{ id: 'notion', label: 'Notion', connected: false, scopes: [], renewable: false, requiresClientId: false }],
          }),
          connectConnector: answer('connectConnector', {
            id: 'notion', label: 'Notion', connected: true, scopes: [], renewable: true, requiresClientId: false,
          }),
          disconnectConnector: answer('disconnectConnector', { connectors: [] }),
        },
      },
    },
  }
}

async function bench(refuse = '') {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const connection = fakeConnection(refuse)
  ctx.provide('connection', connection.handle)
  return { ctx, locale, connection, slots: ctx.get('slots') as SlotRegistry }
}

/** The registered section entry, or undefined while the slot is empty. */
function entryOf(slots: SlotRegistry) {
  return slots.entries(SLOT).find(candidate => candidate.options.id === 'connectors')
}

/** Let every queued microtask settle, so a route's answer has landed. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0) })

describe('ui-settings-connectors browser apply', () => {
  it('declares exactly the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('waits until the settings shell declares the section slot', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries(SLOT)).toHaveLength(0)

    declareSections(b.slots)
    await Promise.resolve()
    expect(entryOf(b.slots)?.component).toBe(ConnectorsSection)
    expect(entryOf(b.slots)?.options.order).toBe(7)
    expect(entryOf(b.slots)?.locale).toBe(NS)
  })

  it('labels the nav row and reports the tag dates are formatted in', async () => {
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const label = entryOf(b.slots)?.options.label as () => string
    const injected = (entryOf(b.slots)!.inject as unknown as () => ConnectorsSectionInjected)()
    expect(label()).toBe('Connections')
    for (const [id, expected] of [['zh-CN', '连接'], ['zh-TW', '連接'], ['ja', '連携']] as const) {
      b.locale.setLocale(id)
      expect(label()).toBe(expected)
      expect(injected.locale()).toBe(id)
    }
  })

  it('carries every gesture to the host route it names', async () => {
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const injected = (entryOf(b.slots)!.inject as unknown as () => ConnectorsSectionInjected)()
    expect(Object.keys(injected))
      .toEqual(['hooks', 'refresh', 'locale', 'connect', 'cancel', 'disconnect', 'dismissError'])

    injected.refresh()
    await settle()
    expect(injected.hooks.connectors.getSnapshot().connectors).toHaveLength(1)

    injected.connect('notion')
    await settle()
    expect(injected.hooks.connectors.getSnapshot().connectors[0]?.connected).toBe(true)

    injected.disconnect('notion')
    await settle()
    expect(injected.hooks.connectors.getSnapshot().connectors).toEqual([])

    // Cancel with nothing open, and dismiss with no failure, are both no-ops
    // a person can reach from the page.
    injected.cancel()
    injected.dismissError()

    expect(b.connection.calls.map(call => call.method))
      .toEqual(['listConnectors', 'connectConnector', 'disconnectConnector'])
    expect(b.connection.calls[1]?.payload).toEqual({ connector: 'notion' })
  })

  it('reports a refusal from every route in the host’s own words', async () => {
    const b = await bench('the credential store is read-only')
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const injected = (entryOf(b.slots)!.inject as unknown as () => ConnectorsSectionInjected)()
    for (const gesture of [
      () => { injected.refresh() },
      () => { injected.connect('notion') },
      () => { injected.disconnect('notion') },
    ]) {
      injected.dismissError()
      gesture()
      await settle()
      expect(injected.hooks.connectors.getSnapshot().error).toBe('the credential store is read-only')
    }
  })
})
