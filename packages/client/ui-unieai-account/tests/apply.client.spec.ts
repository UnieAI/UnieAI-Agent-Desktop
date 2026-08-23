/**
 * ui-unieai-account browser half on a real SlotRegistry: dictionaries ride the
 * locale service, the THREE account pages register into the settings-shell
 * section slot and the row into the sidebar's foot seat — each only once its
 * own declaration exists — the nav labels follow the active locale, the
 * injected faces expose the one shared account source plus the gestures each
 * surface offers, and teardown empties both slots (HMR safety).
 *
 * The lane has no jsdom `window`, so a fresh LocaleRuntime opens on the
 * English fallback; the bench stages `zh` explicitly where it asserts copy.
 */
import { Context } from '@unieai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@unieai/uad-client-runtime/client'
import { LocaleRuntime } from '@unieai/uad-client-locale/client'
import InvariantRegistry from '@unieai/uad-invariants'
import * as AccountInvariant from '@unieai/uad-client-ui-unieai-account/invariant'
import { apply as nodeApply } from '../src/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { ACCOUNT_GATEWAY_SERVICE, type UnieAiAccountGateway } from '../src/account-contract.ts'
import { AccountSection, type AccountSectionInjected } from '../src/client/AccountSection.tsx'
import { UsageSection, type UsageSectionInjected } from '../src/client/UsageSection.tsx'
import { InviteSection, type InviteSectionInjected } from '../src/client/InviteSection.tsx'
import { SidebarAccountRow, type SidebarAccountRowInjected } from '../src/client/SidebarAccountRow.tsx'

const SLOT = 'settings.section'
const ROW_SLOT = 'sidebar.account'

/** Stand in for the settings shell: declare the section slot from root. */
function declareSections(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [SLOT]: { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
}

/** Stand in for the sidebar shell: declare the foot's account seat. */
function declareAccountSeat(slots: SlotRegistry): () => void {
  return slots.register(
    { name: 'root', children: { [ROW_SLOT]: { kind: 'single', scope: 'root' } } } as never,
    () => null,
  )
}

async function bench(gateway?: UnieAiAccountGateway) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  if (gateway !== undefined) ctx.provide(ACCOUNT_GATEWAY_SERVICE, gateway)
  const slots = ctx.get('slots') as SlotRegistry
  return { ctx, slots, locale }
}

/** One registered section entry by id, or undefined while the slot is empty. */
function entryOf(slots: SlotRegistry, id = 'unieai-account') {
  return slots.entries(SLOT).find(candidate => candidate.options.id === id)
}

describe('ui-unieai-account browser apply', () => {
  it('declares every service it binds, and no account gateway', () => {
    // The gateway is deliberately absent: its absence is a state the section
    // renders, not a reason for the fiber to stay pending forever.
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the invariant companion under the package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(AccountInvariant).await()).resolves.toBeDefined()
  })

  it('waits until the settings shell declares the section slot, then fills it three times', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(SLOT)).toHaveLength(0)

    declareSections(b.slots)
    await Promise.resolve()
    // Three pages, not one page with three anchors.
    expect(b.slots.entries(SLOT)).toHaveLength(3)
    expect(entryOf(b.slots)?.component).toBe(AccountSection)
    expect(entryOf(b.slots, 'unieai-usage')?.component).toBe(UsageSection)
    expect(entryOf(b.slots, 'unieai-invite')?.component).toBe(InviteSection)
  })

  it('opens the panel: all three order ahead of the General section, and keep the menu\'s order', async () => {
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const orders = ['unieai-account', 'unieai-usage', 'unieai-invite']
      .map(id => entryOf(b.slots, id)?.options.order as number)
    for (const order of orders) expect(order).toBeLessThan(0)
    // Account, then usage, then invites — the account menu's own order.
    expect([...orders].sort((a, c) => a - c)).toEqual(orders)
  })

  it('labels every nav row from the active locale', async () => {
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const labelOf = (id: string): string =>
      (entryOf(b.slots, id)?.options.label as () => string)()
    expect(labelOf('unieai-account')).toBe('Account')
    expect(labelOf('unieai-usage')).toBe('Usage')
    expect(labelOf('unieai-invite')).toBe('Invite friends')
    b.locale.setLocale('zh-CN')
    expect(labelOf('unieai-account')).toBe('账户')
    expect(labelOf('unieai-usage')).toBe('剩余用量')
    expect(labelOf('unieai-invite')).toBe('邀请好友')
  })

  it('gives each page only the gestures that page offers', async () => {
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const account = (entryOf(b.slots)!.inject as unknown as () => AccountSectionInjected)()
    const usage = (entryOf(b.slots, 'unieai-usage')!.inject as unknown as () => UsageSectionInjected)()
    const invite = (entryOf(b.slots, 'unieai-invite')!.inject as unknown as () => InviteSectionInjected)()

    expect(Object.keys(account)).toEqual(['hooks', 'signIn', 'signOut', 'saveProfile'])
    // Usage reads and can only ask you to sign in; it neither writes a profile
    // nor sends an invite, so neither reaches it.
    expect(Object.keys(usage)).toEqual(['hooks', 'signIn'])
    expect(Object.keys(invite)).toEqual(['hooks', 'signIn', 'sendInvite'])

    // And all three read ONE account source, so the pages can never disagree.
    expect(usage.hooks.account).toBe(account.hooks.account)
    expect(invite.hooks.account).toBe(account.hooks.account)
  })

  it('fills the sidebar foot from the same source, and waits on its declaration', async () => {
    const b = await bench()
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    // Two independent seats: the settings section is undeclared here, and the
    // row still installs once the sidebar declares its own.
    expect(b.slots.entries(ROW_SLOT)).toHaveLength(0)

    declareAccountSeat(b.slots)
    await Promise.resolve()
    const entry = b.slots.entries(ROW_SLOT)[0]
    expect(entry?.component).toBe(SidebarAccountRow)

    // The row reads the section's source and opens a menu over it, so its
    // face carries every gesture that menu offers. The two OPTIONAL services
    // are null in this bench, which is what removes their rows.
    const injected = (entry!.inject as unknown as () => SidebarAccountRowInjected)()
    expect(Object.keys(injected)).toEqual([
      'hooks', 'signIn', 'signOut', 'openAccountSettings', 'setColorScheme', 'setLocale',
    ])
    expect(injected.hooks.account.getSnapshot()).toEqual({ status: 'unavailable' })
    expect(() => { injected.signIn() }).not.toThrow()
    // Presence is READ LIVE, not snapshotted at apply: cordis activation order
    // is unconstrained, so a service that arrives after this plugin must still
    // light up its rows. Neither is composed in this bench.
    expect(injected.hooks.settingsPanel.getSnapshot()).toBe(false)
    expect(injected.hooks.colorScheme.getSnapshot()).toBeNull()
    // The gestures stay callable against an absent service, and reach nothing.
    expect(() => { injected.openAccountSettings('unieai-usage') }).not.toThrow()
    expect(() => { injected.setColorScheme('light') }).not.toThrow()
    // The locale service IS composed, so the language submenu has content.
    expect(injected.hooks.localeState.getSnapshot().locales.length).toBeGreaterThan(0)

    // And the moment a panel is provided, the fact flips without re-registering.
    b.ctx.provide('settingsPanel', { open: () => {} } as never)
    expect(injected.hooks.settingsPanel.getSnapshot()).toBe(true)
  })

  it('injects an unavailable source when no gateway is composed', async () => {
    const b = await bench()
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (entryOf(b.slots)!.inject as unknown as () => AccountSectionInjected)()
    expect(injected.hooks.account.getSnapshot()).toEqual({ status: 'unavailable' })
    // The gestures stay callable and inert; no endpoint is reached.
    expect(() => { injected.signIn() }).not.toThrow()
    expect(() => { injected.signOut() }).not.toThrow()
  })

  it('mirrors a composed gateway and forwards both gestures to it', async () => {
    const signIn = vi.fn()
    const signOut = vi.fn()
    const gateway: UnieAiAccountGateway = {
      getSnapshot: () => ({ status: 'signed-out' }),
      subscribe: () => () => {},
      signIn,
      signOut,
      saveProfile: vi.fn(async () => ({ status: 'saved' as const })),
    }
    const b = await bench(gateway)
    declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (entryOf(b.slots)!.inject as unknown as () => AccountSectionInjected)()

    expect(injected.hooks.account.getSnapshot()).toEqual({ status: 'signed-out' })
    injected.signIn()
    injected.signOut()
    expect(signIn).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('withdraws every section and releases the gateway on teardown', async () => {
    const off = vi.fn()
    const gateway: UnieAiAccountGateway = {
      getSnapshot: () => ({ status: 'signed-out' }),
      subscribe: () => off,
      signIn: vi.fn(),
      signOut: vi.fn(),
      saveProfile: vi.fn(async () => ({ status: 'saved' as const })),
    }
    const b = await bench(gateway)
    declareSections(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(entryOf(b.slots)).toBeDefined()

    await fiber.dispose()
    // All three go together: a nav holding two of them lies about what it has.
    expect(b.slots.entries(SLOT)).toHaveLength(0)
    expect(off).toHaveBeenCalledTimes(1)
  })

  it('withdraws the sidebar row on teardown too', async () => {
    const b = await bench()
    declareAccountSeat(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries(ROW_SLOT)).toHaveLength(1)

    await fiber.dispose()
    expect(b.slots.entries(ROW_SLOT)).toHaveLength(0)
  })

  it('re-registers after the declaration collapses and returns', async () => {
    const b = await bench()
    const undeclare = declareSections(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(entryOf(b.slots)).toBeDefined()

    undeclare()
    await Promise.resolve()
    expect(b.slots.entries(SLOT)).toHaveLength(0)

    declareSections(b.slots)
    await Promise.resolve()
    expect(b.slots.entries(SLOT)).toHaveLength(3)
  })
})
