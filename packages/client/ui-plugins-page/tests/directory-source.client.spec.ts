/**
 * What the directory source makes of what the gate says.
 *
 * The reading is asserted separately from the fetching because the two fail
 * differently: a body this page cannot read is a `failed` catalogue, while a
 * 404 is a product that does not serve one and never will.
 */
import { describe, expect, it, vi } from 'vitest'
import { DirectorySource, readDirectoryResponse } from '../src/client/directory-source.ts'

/** A gate that answers every ask with one canned response, recording the asks. */
function gate(answers: { status: number; body?: unknown }[]) {
  const sent: { path: string; method: string; body: string | undefined }[] = []
  let index = 0
  const request = (path: string, init?: RequestInit) => {
    sent.push({
      path,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    })
    const answer = answers[Math.min(index, answers.length - 1)]
    index += 1
    return Promise.resolve({
      ok: (answer?.status ?? 200) < 400,
      status: answer?.status ?? 200,
      json: () => Promise.resolve(answer?.body),
    } as Response)
  }
  return { sent, source: new DirectorySource({ request }) }
}

const ROW = {
  slug: 'partner-lseg',
  name: 'lseg',
  description: 'Price bonds, analyze yield curves.',
  category: 'partner',
  author: 'LSEG',
  iconUrl: '',
  skillCount: 8,
  tryAsking: ['Analyze Swap Curve'],
  installed: true,
  enabled: true,
}

describe('reading a catalogue envelope', () => {
  it('keeps every field the row shows', () => {
    const state = readDirectoryResponse({ plugins: [ROW], canInstall: true })
    expect(state).toEqual({
      status: 'ready',
      canInstall: true,
      plugins: [{
        slug: 'partner-lseg',
        name: 'lseg',
        description: 'Price bonds, analyze yield curves.',
        category: 'partner',
        author: 'LSEG',
        iconUrl: null,
        skillCount: 8,
        tryAsking: ['Analyze Swap Curve'],
        installed: true,
        enabled: true,
      }],
    })
  })

  it('reads a stored empty icon as no icon, not as a URL', () => {
    // The product's column is NOT NULL DEFAULT '', so this is the ordinary
    // answer for a publisher who uploaded nothing. Carried through as a URL it
    // would make the page fetch itself once per iconless row.
    const state = readDirectoryResponse({ plugins: [{ ...ROW, iconUrl: '   ' }] })
    expect(state).toMatchObject({ plugins: [{ iconUrl: null }] })
  })

  it('carries an absent category as empty rather than filing it under a bucket', () => {
    // Which heading an ungrouped plugin lands under is the page's decision. A
    // source that pre-decided it would make "the manifest named none" and "the
    // product really said other" the same row.
    const state = readDirectoryResponse({ plugins: [{ ...ROW, category: undefined }] })
    expect(state).toMatchObject({ plugins: [{ category: '' }] })
  })

  it('refuses to mark a row active when it is not installed', () => {
    const state = readDirectoryResponse({ plugins: [{ ...ROW, installed: false, enabled: true }] })
    expect(state).toMatchObject({ plugins: [{ installed: false, enabled: false }] })
  })

  it('drops an entry with no slug, because every control on the row is keyed on it', () => {
    const state = readDirectoryResponse({ plugins: [{ ...ROW, slug: '' }, ROW] })
    expect(state).toMatchObject({ plugins: [{ slug: 'partner-lseg' }] })
  })

  it('falls back to the slug for a nameless plugin instead of hiding it', () => {
    // Hiding it would leave an install the account already has unremovable here.
    const state = readDirectoryResponse({ plugins: [{ ...ROW, name: '  ' }] })
    expect(state).toMatchObject({ plugins: [{ name: 'partner-lseg' }] })
  })

  it('treats an empty catalogue as an answer and a missing list as unreadable', () => {
    expect(readDirectoryResponse({ plugins: [] })).toEqual({ status: 'ready', plugins: [], canInstall: false })
    expect(readDirectoryResponse({})).toBeUndefined()
    expect(readDirectoryResponse(null)).toBeUndefined()
  })

  it('reads the gate’s own signed-out envelope', () => {
    expect(readDirectoryResponse({ status: 'signed-out' })).toEqual({ status: 'signed-out' })
  })
})

describe('reading the route', () => {
  it('separates a product that serves no directory from one whose read failed', async () => {
    // 404 is `unsupported`: a product older than the route will keep answering
    // 404, so offering a Retry would offer a gesture that cannot work.
    const missing = gate([{ status: 404 }])
    await missing.source.refresh()
    expect(missing.source.getSnapshot()).toEqual({ status: 'unsupported' })

    const broken = gate([{ status: 500 }])
    await broken.source.refresh()
    expect(broken.source.getSnapshot()).toEqual({ status: 'failed' })

    const out = gate([{ status: 401 }])
    await out.source.refresh()
    expect(out.source.getSnapshot()).toEqual({ status: 'signed-out' })
  })

  it('publishes once per change, not once per read', async () => {
    const { source } = gate([{ status: 200, body: { plugins: [ROW], canInstall: true } }])
    const listener = vi.fn()
    source.subscribe(listener)
    await source.refresh()
    await source.refresh()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('re-reads the catalogue behind a write rather than flipping the row itself', async () => {
    // The product decides what installed means — which version was bound,
    // whether a policy downgraded the ask — so the row moves on the re-read.
    const { sent, source } = gate([
      { status: 200, body: { plugins: [{ ...ROW, installed: false }], canInstall: true } },
      { status: 200, body: {} },
      { status: 200, body: { plugins: [ROW], canInstall: true } },
    ])
    await source.refresh()
    expect(source.getSnapshot()).toMatchObject({ plugins: [{ installed: false }] })

    const outcome = await source.install('partner-lseg')
    expect(outcome).toEqual({ ok: true })
    expect(sent[1]).toEqual({
      path: '/auth/plugins/install',
      method: 'POST',
      body: '{"slug":"partner-lseg"}',
    })
    expect(sent[2]?.path).toBe('/auth/plugins')
    expect(source.getSnapshot()).toMatchObject({ plugins: [{ installed: true }] })
  })

  it('removes with the same route and a different verb', async () => {
    const { sent, source } = gate([{ status: 200, body: { plugins: [] } }])
    await source.remove('partner-lseg')
    expect(sent[0]).toMatchObject({ path: '/auth/plugins/install', method: 'DELETE' })
  })

  it('names the plan refusal apart from every other failure', async () => {
    // The two need different words: one is a limit the reader can lift, the
    // other is something that went wrong.
    const plan = gate([{ status: 403, body: { error: 'plugins_not_in_plan' } }])
    expect(await plan.source.install('x')).toEqual({ ok: false, reason: 'error.plan' })

    const gone = gate([{ status: 404, body: {} }])
    expect(await gone.source.install('x')).toEqual({ ok: false, reason: 'error.notFound' })

    const broken = gate([{ status: 500, body: {} }])
    expect(await broken.source.install('x')).toEqual({ ok: false, reason: 'error.failed' })
  })

  it('publishes nothing once disposed, so a read in flight lands nowhere', async () => {
    const { source } = gate([{ status: 200, body: { plugins: [ROW] } }])
    const listener = vi.fn()
    source.subscribe(listener)
    const pending = source.refresh()
    source.dispose()
    await pending
    expect(listener).not.toHaveBeenCalled()
    expect(source.getSnapshot()).toEqual({ status: 'loading' })
  })
})
