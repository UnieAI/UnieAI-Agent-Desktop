// @vitest-environment jsdom
// Each machine keeps its own workspace across a switch.
//
// A workspace is a path, and a path belongs to the machine it is on: the
// folder someone picked on a build host is not on their laptop. Carrying one
// across a switch aims the next command at a directory that is not there —
// which is what a person sees as "I picked a folder and it bounced back to
// Choose folder". So the machine being left has its workspace recorded, and
// the machine being entered gets back the one it was last in.

import { describe, expect, it } from 'vitest'
import { SlotTestRuntime, stubSettingsScope } from '@unieai/uad-client-test-runtime'
import { LocaleRuntime } from '@unieai/uad-client-locale/client'
import { apply, inject } from '@unieai/uad-client-ui-machines/client'
import type { WorkspaceId, WorkspaceView } from '@unieai/uad-client-runtime/client'
import { WORKSPACE_BY_MACHINE_FIELD } from '../src/machine-settings.ts'

/** The verbs these cases drive, typed at this spec's own contract. */
interface Injected {
  refresh: () => Promise<void>
  select: (machine: string) => Promise<void>
}

type Memory = { workspaceByMachine?: Record<string, string> }

/** Host machine answers: `current` is whatever was last selected. */
function connectionFake() {
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
        // Picking a machine tests it first; these cases are about what happens
        // AFTER a switch the host agreed to.
        probeMachine: () => Promise.resolve({ result: { ok: true, value: { reachable: true, message: '' } } }),
        selectMachine: ({ machine }: { machine: string }) => {
          current = machine
          return Promise.resolve(listing())
        },
      },
    },
    isLoopback: true,
  }
}

/** A workspace row as the list carries it. */
const workspace = (id: string): WorkspaceView =>
  ({ workspaceId: id as WorkspaceId, title: id, path: `/w/${id}`, sessionIds: [] }) as unknown as WorkspaceView

async function bench(options: { remembered?: Record<string, string>; rows?: string[]; recent?: string } = {}) {
  const runtime = await SlotTestRuntime.create()
  runtime.provide('connection', connectionFake())
  const settings = stubSettingsScope<Memory>()
  if (options.remembered !== undefined) {
    settings.publish({ status: 'ready', value: { workspaceByMachine: options.remembered } })
  }
  runtime.provide('settingsScope', { bind: () => settings.scope as never })
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.provide('locale', locale)
  runtime.slots.installLocale(locale)
  await runtime.workspaces.update((draft) => {
    draft.items = (options.rows ?? ['ws-local', 'ws-build']).map(workspace)
    draft.recentWorkspaceId = options.recent as WorkspaceId | undefined
  })
  await runtime.declare({ 'conversation.input.chrome.end': { kind: 'list', scope: 'root' } })
  await runtime.mount({ apply, inject })
  const entry = runtime.slots.entries('conversation.input.chrome.end')[0]!
  const injected = (entry.inject as unknown as () => Injected)()
  await injected.refresh()
  return { runtime, injected, settings }
}

/** Workspace ids passed to startSession, in order. */
const opened = (runtime: SlotTestRuntime): unknown[] =>
  runtime.workspaces.calls.filter(call => call.method === 'startSession').map(call => call.args[0])

describe('each machine keeps its own workspace', () => {
  it('records the workspace of the machine being left', async () => {
    const { injected, settings } = await bench({ recent: 'ws-local' })
    await injected.select('build-box')
    expect(settings.set).toHaveBeenCalledWith(WORKSPACE_BY_MACHINE_FIELD, { local: 'ws-local' })
  })

  it('reopens the workspace the machine being entered was last in', async () => {
    const { runtime, injected } = await bench({
      remembered: { 'build-box': 'ws-build' },
      recent: 'ws-local',
    })
    await injected.select('build-box')
    expect(opened(runtime)).toEqual(['ws-build'])
  })

  it('leaves the current workspace alone on a machine nobody has used yet', async () => {
    // Nothing to restore is not the same as "no workspace": arriving somewhere
    // new must not empty the screen of a person who has chosen nothing there.
    const { runtime, injected } = await bench({ recent: 'ws-local' })
    await injected.select('build-box')
    expect(opened(runtime)).toEqual([])
  })

  it('skips a remembered workspace that no longer exists', async () => {
    const { runtime, injected } = await bench({
      remembered: { 'build-box': 'ws-deleted' },
      rows: ['ws-local'],
      recent: 'ws-local',
    })
    await injected.select('build-box')
    expect(opened(runtime)).toEqual([])
  })

  it('records nothing for a machine that was not in a workspace', async () => {
    const { injected, settings } = await bench({})
    await injected.select('build-box')
    expect(settings.set).toHaveBeenCalledWith(WORKSPACE_BY_MACHINE_FIELD, {})
  })

  it('says nothing and moves nothing when the pick is refused', async () => {
    const { runtime, injected, settings } = await bench({ recent: 'ws-local' })
    await injected.select('local') // already current: not a move
    expect(settings.set).not.toHaveBeenCalled()
    expect(opened(runtime)).toEqual([])
  })
})
