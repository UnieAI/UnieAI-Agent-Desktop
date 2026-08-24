/** The browser half of the operator terminal: calls out, frames in. */
import { Context } from '@unieai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { HostFrame, RpcRequest } from '@unieai/uad-api-remotes/client'
import { TerminalError, TerminalRuntime } from '../src/client/terminals/service.ts'
import { FakeApiClient } from './fake-api.client.ts'

/**
 * @returns a runtime over a fake wire, plus that wire.
 */
function bench(): { runtime: TerminalRuntime; api: FakeApiClient } {
  // A fresh root per bench: the service claims its ctx key on construction,
  // and a shared root would refuse the second claim.
  const ctx = new Context()
  const api = new FakeApiClient()
  return { runtime: new TerminalRuntime(ctx, api), api }
}

/**
 * @param payload - the frame body.
 * @returns it wrapped as an envelope.
 */
function envelope(payload: HostFrame): RpcRequest<HostFrame> {
  return { rpcId: 'frame' as never, payload }
}

describe('TerminalRuntime calls', () => {
  it('opens a terminal and hands back what it already produced', async () => {
    const { runtime, api } = bench()
    const opened = await runtime.open('w1', '/w', 80, 24)
    expect(opened.terminal.terminalId).toBe('fk-term')
    expect(api.calls.map(call => call.method)).toContain('terminal.open')
  })

  it('passes keystrokes through verbatim', async () => {
    const { runtime, api } = bench()
    await runtime.write('t1', 'ls -la\r')
    expect(api.calls.at(-1)).toMatchObject({
      method: 'terminal.write',
      payload: { terminalId: 't1', data: 'ls -la\r' },
    })
  })

  it('delivers keystrokes in typing order even when the wire answers out of order', async () => {
    // The regression: each keystroke is its own HTTP request, and HTTP makes
    // no promise about the order two in-flight requests finish in. Typing
    // `echo` fast against a real shell produced `ecoh`.
    const { runtime, api } = bench()
    api.delayNext('terminal.write', 40)
    const first = runtime.write('t1', 'e')
    const rest = ['c', 'h', 'o'].map(key => runtime.write('t1', key))
    await Promise.all([first, ...rest])
    expect(api.calls.filter(call => call.method === 'terminal.write')
      .map(call => (call.payload as { data: string }).data).join('')).toBe('echo')
  })

  it('keeps taking keystrokes after one write fails', async () => {
    // A terminal that stays dead after one dropped packet is worse than one
    // that lost a character.
    const { runtime, api } = bench()
    api.failNext('terminal.write', { code: 'internal', message: 'dropped', details: {} })
    await expect(runtime.write('t1', 'a')).rejects.toBeInstanceOf(TerminalError)
    await expect(runtime.write('t1', 'b')).resolves.toBeUndefined()
  })

  it('reports the panel size and the signal the person pressed', async () => {
    const { runtime, api } = bench()
    await runtime.resize('t1', 120, 40)
    await runtime.signal('t1', 'SIGINT')
    expect(api.calls.at(-2)).toMatchObject({ method: 'terminal.resize', payload: { cols: 120, rows: 40 } })
    expect(api.calls.at(-1)).toMatchObject({ method: 'terminal.signal', payload: { signal: 'SIGINT' } })
  })

  it('raises the Host code so a panel can say WHY, not just that it failed', async () => {
    const { runtime, api } = bench()
    api.failNext('terminal.open', { code: 'terminal-disabled', message: 'turned off', details: {} })
    await expect(runtime.open('w1', '/w', 80, 24)).rejects.toBeInstanceOf(TerminalError)
    await expect(runtime.open('w1', '/w', 80, 24)).resolves.toBeDefined()
  })
})

describe('TerminalRuntime frames', () => {
  it('delivers output only to the renderer showing that terminal', () => {
    const { runtime } = bench()
    const one: string[] = []
    const two: string[] = []
    runtime.subscribe('a', { output: chunk => one.push(chunk), exited: () => {} })
    runtime.subscribe('b', { output: chunk => two.push(chunk), exited: () => {} })
    runtime.handleHostEnvelope(envelope({ type: 'terminal/output', terminalId: 'a', chunk: '$ ls' }))
    expect(one).toEqual(['$ ls'])
    expect(two).toEqual([])
  })

  it('stops delivering once a renderer unmounts, without ending the terminal', () => {
    // The disposer is the point: the panel closes, the shell keeps running,
    // and reopening the panel picks the same terminal back up.
    const { runtime } = bench()
    const seen: string[] = []
    const dispose = runtime.subscribe('a', { output: chunk => seen.push(chunk), exited: () => {} })
    runtime.handleHostEnvelope(envelope({ type: 'terminal/output', terminalId: 'a', chunk: 'first' }))
    dispose()
    runtime.handleHostEnvelope(envelope({ type: 'terminal/output', terminalId: 'a', chunk: 'second' }))
    expect(seen).toEqual(['first'])
  })

  it('tells every renderer of one terminal that its shell ended', () => {
    const { runtime } = bench()
    const exits: (number | undefined)[] = []
    runtime.subscribe('a', { output: () => {}, exited: code => exits.push(code) })
    runtime.subscribe('a', { output: () => {}, exited: code => exits.push(code) })
    runtime.handleHostEnvelope(envelope({ type: 'terminal/exited', terminalId: 'a', exitCode: 3 }))
    expect(exits).toEqual([3, 3])
  })

  it('publishes the whole list, which is what makes a second tab agree', () => {
    const { runtime } = bench()
    const view = {
      terminalId: 'a', workspaceId: 'w', cwd: '/w', shell: '/bin/bash', title: 'user@fixture',
      cols: 80, rows: 24, live: true,
    }
    runtime.handleHostEnvelope(envelope({ type: 'terminal/changed', terminals: [view] }))
    expect(runtime.store.getSnapshot()).toEqual({ terminals: [view], ready: true })
  })

  it('ignores frames that belong to other subsystems', () => {
    const { runtime } = bench()
    const seen: string[] = []
    runtime.subscribe('a', { output: chunk => seen.push(chunk), exited: () => {} })
    runtime.handleHostEnvelope(envelope({ type: 'host/session-removed', sessionId: 's1' as never }))
    expect(seen).toEqual([])
    expect(runtime.store.getSnapshot().ready).toBe(false)
  })
})

describe('TerminalRuntime reconnect', () => {
  it('re-reads the list after a reconnect rather than assuming it survived', async () => {
    const { runtime, api } = bench()
    runtime.handleConnected()
    await vi.waitFor(() => {
      expect(api.calls.map(call => call.method)).toContain('terminal.list')
    })
    expect(runtime.store.getSnapshot().ready).toBe(true)
  })

  it('treats a deployment with no terminal service as an absent feature, not a failure', async () => {
    const { runtime, api } = bench()
    api.failNext('terminal.list', { code: 'terminal-unavailable', message: 'not composed', details: {} })
    await runtime.refresh()
    expect(runtime.store.getSnapshot()).toEqual({ terminals: [], ready: true })
  })
})
