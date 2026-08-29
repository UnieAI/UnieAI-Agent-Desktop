// @vitest-environment jsdom
// The one fact this plugin tells the rest of the client: work moved to
// another machine. Surfaces that describe a machine — the gauges strip above
// all — are showing the wrong machine's answer until they hear it, and their
// own polling cannot tell an old reading from a reading of somewhere else.

import { describe, expect, it } from 'vitest'
import { SlotTestRuntime } from '@unieai/uad-client-test-runtime'
import { LocaleRuntime } from '@unieai/uad-client-locale/client'
import { apply, inject } from '@unieai/uad-client-ui-machines/client'

/** The two verbs these cases drive, typed at this spec's own contract. */
interface Injected {
  refresh: () => Promise<void>
  select: (machine: string) => Promise<void>
}

/** The host answers this plugin makes; `current` is whatever was last selected. */
function connectionFake(): { api: { host: Record<string, unknown> }; isLoopback: boolean } {
  let current = 'local'
  const machines = [
    { id: 'local', label: 'This computer', kind: 'local' },
    { id: 'build-box', label: 'build-box', kind: 'ssh' },
  ]
  const listing = () => ({ result: { ok: true, value: { machines, current } } })
  return {
    api: {
      host: {
        listMachines: () => Promise.resolve(listing()),
        selectMachine: ({ machine }: { machine: string }) => {
          current = machine
          return Promise.resolve(listing())
        },
      },
    },
    isLoopback: true,
  }
}

async function bench() {
  const runtime = await SlotTestRuntime.create()
  runtime.provide('connection', connectionFake())
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.declare({ 'conversation.input.chrome.end': { kind: 'list', scope: 'root' } })
  await runtime.mount({ apply, inject })
  const entry = runtime.slots.entries('conversation.input.chrome.end')[0]!
  const injected = (entry.inject as unknown as () => Injected)()
  const announced: string[] = []
  runtime.ctx.on('machines/changed', (machine) => { announced.push(machine) })
  return { runtime, injected, announced }
}

describe('announcing a machine change', () => {
  it('announces the machine the host agreed to, once', async () => {
    const { runtime, injected, announced } = await bench()
    await injected.refresh()
    await injected.select('build-box')
    expect(announced).toEqual(['build-box'])
    await runtime.dispose()
  })

  it('says nothing when the pick was the machine already in use', async () => {
    // Nothing moved, so nothing describing the machine is out of date; a
    // resample here would spend a command on someone's machine for no reason.
    const { runtime, injected, announced } = await bench()
    await injected.refresh()
    await injected.select('local')
    expect(announced).toEqual([])
    await runtime.dispose()
  })
})
