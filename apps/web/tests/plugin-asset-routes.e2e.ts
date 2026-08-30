// Web e2e: a plugin's own HTTP routes answer from the moment a page loads.
//
// `genui` renders diagrams by fetching engine bundles (mermaid, three,
// echarts) from a webServer prefix route its `apply` registers. That route
// exists only while the plugin is mounted, and a page asks for those files as
// soon as it renders a diagram — so the plugin has to be in the HOST
// composition, not in an agent preset whose standing mount is built when the
// first agent joins.
//
// This is a regression test with a specific history: moving `genui` into the
// standard preset (to stop its model-facing tools reaching every agent) left
// the route unmounted at page load, and every engine fetch answered 404 with
// nothing failing loudly — diagrams simply never drew. Nothing in the suite
// noticed, because no test had ever asked the route a question. This one does.
// Zero model calls: it drives HTTP against the running host only.
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

/** The engine bundles genui serves; each is fetched lazily by a drawing page. */
const ENGINE_BUNDLES = ['mermaid.js', 'three.js', 'echarts.js'] as const

describe('web e2e: plugin asset routes', () => {
  let scaffold: WebScaffold

  beforeAll(async () => { scaffold = await launchWebScaffold({}) }, 120_000)
  afterAll(async () => { await scaffold?.close() })

  it('genui serves its engine bundles before any agent has joined', async () => {
    // Deliberately no session and no agent: the point is that the route
    // answers on a freshly booted host, which is the state a loading page is
    // in when it asks for these.
    for (const file of ENGINE_BUNDLES) {
      const response = await fetch(`${scaffold.baseUrl}/plugins/@unieai/genui/assets/${file}`)
      expect(response.status, `${file} must be served, not 404`).toBe(200)
      expect((await response.text()).length, `${file} must have content`).toBeGreaterThan(0)
    }
  }, 60_000)

  it('the route refuses a path that is not a flat .js asset', async () => {
    // The handler's own contract: flat names only, no traversal. Asserted so
    // the fix above cannot be "mount it and open the directory".
    const traversal = await fetch(`${scaffold.baseUrl}/plugins/@unieai/genui/assets/../package.json`)
    expect(traversal.status).not.toBe(200)
  }, 30_000)
})
