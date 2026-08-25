/** Which browser this package drives, and the flags it drives it with. */
import { describe, expect, it } from 'vitest'
import { CHROME_PATH_VARIABLE, chromeArgs, resolveChrome, type ChromeProbe } from '../src/chrome.ts'
import { endpointFrom } from '../src/cdp.ts'

/**
 * @param present - absolute paths that exist.
 * @param dirs - directory listings, keyed by path.
 * @param carried - carried-browser manifests, keyed by package specifier.
 * @returns a probe answering only for those.
 */
function probe(
  present: string[],
  dirs: Record<string, string[]> = {},
  carried: Record<string, { path: string; executable?: unknown }> = {},
): ChromeProbe {
  return {
    exists: path => present.includes(path),
    list: path => dirs[path] ?? [],
    // Default: this machine carries no browser, which is what every test about
    // the SEARCH order needs — a carried one outranks everything it searches.
    manifest: specifier => carried[specifier]?.path,
    readManifest: (path) => {
      const found = Object.values(carried).find(one => one.path === path)
      return found === undefined ? undefined : { executable: found.executable }
    },
  }
}

describe('resolveChrome', () => {
  it('takes the browser a deployment names, ahead of any search', () => {
    // A deployment that names one has a reason; a search that could overrule
    // it would be this package deciding it knows the machine better.
    const chosen = resolveChrome(
      { [CHROME_PATH_VARIABLE]: '/opt/my-chrome' }, 'linux',
      probe(['/opt/my-chrome', '/usr/bin/google-chrome']))
    expect(chosen).toBe('/opt/my-chrome')
  })

  it('ignores a named browser that is not there', () => {
    const chosen = resolveChrome(
      { [CHROME_PATH_VARIABLE]: '/opt/removed' }, 'linux', probe(['/usr/bin/chromium']))
    expect(chosen).toBe('/usr/bin/chromium')
  })

  it('prefers Chrome to Chromium to Edge, which is what people actually use', () => {
    expect(resolveChrome({}, 'linux', probe(['/usr/bin/chromium', '/usr/bin/google-chrome'])))
      .toBe('/usr/bin/google-chrome')
    expect(resolveChrome({}, 'linux', probe(['/usr/bin/microsoft-edge', '/usr/bin/chromium'])))
      .toBe('/usr/bin/chromium')
  })

  it('takes the browser this install carries over the one the machine happens to have', () => {
    // The point of carrying one is that every install renders the same page the
    // same way: a pinned build outranks whatever version is on the machine, so a
    // bug report names a browser everyone else can reproduce with.
    const chosen = resolveChrome({}, 'linux',
      probe(
        ['/usr/bin/google-chrome', '/node_modules/@unieai/rabi-chromium-linux-x64/browser/chrome-linux64/chrome'],
        {},
        {
          '@unieai/rabi-chromium-linux-x64/chromium.json': {
            path: '/node_modules/@unieai/rabi-chromium-linux-x64/chromium.json',
            executable: 'chrome-linux64/chrome',
          },
        }),
      'x64')
    expect(chosen).toBe('/node_modules/@unieai/rabi-chromium-linux-x64/browser/chrome-linux64/chrome')
  })

  it('still lets a deployment name its own browser over the carried one', () => {
    const chosen = resolveChrome({ [CHROME_PATH_VARIABLE]: '/opt/my-chrome' }, 'linux',
      probe(
        ['/opt/my-chrome', '/node_modules/@unieai/rabi-chromium-linux-x64/browser/chrome-linux64/chrome'],
        {},
        {
          '@unieai/rabi-chromium-linux-x64/chromium.json': {
            path: '/node_modules/@unieai/rabi-chromium-linux-x64/chromium.json',
            executable: 'chrome-linux64/chrome',
          },
        }),
      'x64')
    expect(chosen).toBe('/opt/my-chrome')
  })

  it('searches on when the carried package is absent, or its payload is not', () => {
    // Absent is the ordinary case on an unlisted platform: npm installs none of
    // the four rather than failing, so this must fall through, not throw.
    expect(resolveChrome({}, 'linux', probe(['/usr/bin/google-chrome']), 'x64'))
      .toBe('/usr/bin/google-chrome')
    // Manifest present, browser missing: a half-extracted install.
    expect(resolveChrome({}, 'linux',
      probe(['/usr/bin/google-chrome'], {}, {
        '@unieai/rabi-chromium-linux-x64/chromium.json': {
          path: '/node_modules/@unieai/rabi-chromium-linux-x64/chromium.json',
          executable: 'chrome-linux64/chrome',
        },
      }), 'x64'))
      .toBe('/usr/bin/google-chrome')
  })

  it('knows where each platform keeps one', () => {
    expect(resolveChrome({}, 'darwin',
      probe(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])))
      .toContain('Google Chrome')
    expect(resolveChrome({}, 'win32',
      probe(['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'])))
      .toContain('chrome.exe')
  })

  it('falls back to a Playwright install, newest first', () => {
    // Someone who has run this repository's browser tests already has one on
    // disk; asking them to install a second to look at a page would be this
    // package ignoring what is in front of it.
    const base = '/cache/ms-playwright'
    const chosen = resolveChrome({ PLAYWRIGHT_BROWSERS_PATH: base }, 'linux', probe(
      [`${base}/chromium-1228/chrome-linux64/chrome`, `${base}/chromium-999/chrome-linux64/chrome`],
      { [base]: ['chromium-999', 'chromium-1228', 'ffmpeg-1011'] }))
    expect(chosen).toBe(`${base}/chromium-1228/chrome-linux64/chrome`)
  })

  it('reports that this machine has none rather than guessing', () => {
    expect(resolveChrome({}, 'linux', probe([]))).toBeUndefined()
  })
})

describe('chromeArgs', () => {
  it('always uses a profile of its own', () => {
    // Chrome refuses a debugging port on a profile that is already open, so
    // reusing the person's would fail or make them close their browser first
    // — and it would put their cookies and history behind this panel.
    const args = chromeArgs('/tmp/profile', 800, 600)
    expect(args).toContain('--user-data-dir=/tmp/profile')
    expect(args).toContain('--remote-debugging-port=0')
    expect(args).toContain('--window-size=800,600')
  })

  it('asks the OS for a free port rather than fixing one', () => {
    // Two panels on a fixed port collide; the chosen one is read back from
    // the browser's own stderr.
    expect(chromeArgs('/tmp/p', 1, 1).some(arg => /^--remote-debugging-port=[1-9]/u.test(arg))).toBe(false)
  })
})

describe('endpointFrom', () => {
  it('reads the endpoint out of the browser own stderr', () => {
    expect(endpointFrom('DevTools listening on ws://127.0.0.1:41337/devtools/browser/abc\n'))
      .toBe('ws://127.0.0.1:41337/devtools/browser/abc')
  })

  it('reports nothing for a chunk that does not carry it', () => {
    expect(endpointFrom('[0824/120000.1:WARNING:something] noise')).toBeUndefined()
  })
})
