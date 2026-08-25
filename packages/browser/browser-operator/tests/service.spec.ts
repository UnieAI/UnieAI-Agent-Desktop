/**
 * What the registry refuses before it ever launches a browser.
 *
 * Everything here is reachable without one, which is the point: the refusals
 * are the contract, and a test that needed Chromium to check them would not
 * run on a machine that has none.
 */
import { Context } from '@unieai/cordis'
import { describe, expect, it } from 'vitest'
import { OperatorBrowserService } from '../src/index.ts'
import type { ChromeProbe } from '../src/chrome.ts'

const NO_CHROME: ChromeProbe = { exists: () => false, list: () => [] }

/**
 * @param config - overrides for the plugin config.
 * @param probe - the browser probe to search with.
 * @returns the service under test.
 */
function service(config: Record<string, unknown> = {}, probe: ChromeProbe = NO_CHROME): OperatorBrowserService {
  return new OperatorBrowserService(
    new Context(),
    { enabled: true, maxBrowsersPerWorkspace: 2, frameQuality: 70, startupTimeoutSeconds: 5, ...config },
    probe, {})
}

const opening = (url: string) => ({ workspaceId: 'w1', url, width: 800, height: 600 })

describe('what the browser refuses to open', () => {
  it('refuses when the deployment turned it off', async () => {
    await expect(service({ enabled: false }).open(opening('https://example.com')))
      .rejects.toMatchObject({ code: 'DISABLED' })
  })

  it('refuses a file: URL, which would make a URL bar a filesystem reader', async () => {
    await expect(service().open(opening('file:///etc/passwd')))
      .rejects.toMatchObject({ code: 'BLOCKED_URL' })
  })

  it('refuses the schemes that reach the browser rather than a page', async () => {
    for (const url of ['javascript:alert(1)', 'chrome://settings', 'devtools://devtools/bundled/x.html']) {
      await expect(service().open(opening(url))).rejects.toMatchObject({ code: 'BLOCKED_URL' })
    }
  })

  it('refuses something that is not a URL at all', async () => {
    await expect(service().open(opening('not a url'))).rejects.toMatchObject({ code: 'BLOCKED_URL' })
  })

  it('says plainly that this machine has no browser', async () => {
    await expect(service().open(opening('https://example.com')))
      .rejects.toMatchObject({ code: 'NO_CHROME' })
  })

  it('names an unknown browser rather than failing anonymously', async () => {
    const svc = service()
    await expect(svc.navigate('browser-99' as never, 'https://example.com'))
      .rejects.toMatchObject({ code: 'NO_BROWSER' })
    expect(() => svc.lastFrame('browser-99' as never)).toThrow(/browser-99/u)
  })

  it('has nothing open, and no live browser for a workspace, before one is', () => {
    const svc = service()
    expect(svc.list()).toEqual([])
    expect(svc.liveIn('w1')).toBeUndefined()
  })
})

describe('config validation', () => {
  it('refuses a frame quality outside what JPEG accepts', () => {
    expect(() => service({ frameQuality: 0 })).toThrow(/frameQuality/u)
    expect(() => service({ frameQuality: 101 })).toThrow(/frameQuality/u)
  })

  it('refuses a relative browser path, which would not name the one a person chose', () => {
    expect(() => service({ chromePath: 'chrome' })).toThrow(/absolute/u)
  })

  it('accepts an absolute one on either platform spelling', () => {
    expect(() => service({ chromePath: '/opt/chrome' })).not.toThrow()
    expect(() => service({ chromePath: 'C:\\Chrome\\chrome.exe' })).not.toThrow()
  })
})
