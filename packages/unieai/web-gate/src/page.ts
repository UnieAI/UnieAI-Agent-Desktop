/**
 * The sign-in page, rendered by the host before any client bundle exists.
 *
 * It is deliberately a self-contained document: it is served to visitors who
 * have not been admitted, so it must not pull the application shell, the
 * plugin registry, or any `ui-theme` stylesheet — none of which an
 * unauthenticated request may reach. That is why the design values below are
 * restated inline rather than imported.
 *
 * The layout follows the shadcn/ui `LoginForm` block: a centred card holding a
 * mark, a bold title, a muted description, and a full-width primary action.
 * Its Tailwind classes are resolved to literal values here because this
 * repository ships neither Tailwind nor a component library
 * (`docs/web-styling.md`); the metrics, not the mechanism, are what carry over.
 *
 * What the block's form contains is NOT reproduced, because this product has
 * nowhere to send it. There is no email field: the desktop holds no user
 * database and authenticates only through the web product. There are no
 * per-provider buttons: choosing Google or Microsoft happens on that product's
 * own sign-in page, and two buttons here would open the same URL while
 * implying otherwise. There is no terms line: this deployment publishes no
 * terms or privacy page to link to.
 */

/** Escape text for interpolation into element content or a quoted attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The UnieAI mark at the block's `size-6` glyph size, in a `size-8` box. */
const MARK = '<svg viewBox="0 0 499.28 444.55" width="27" height="24" aria-hidden="true">'
  + '<path fill="currentColor" d="m496.58,432.3c-7.44-13.21-219.4-145.81-455.36-17.82,0,0-3.98-2.73,6.18-10.69,'
  + '9.96-7.86,49.58-32.18,124.43-55.66,74.74-26.21,149.17-29.56,177.26-130.4,58.7,18.55,86.06,48.64,84.7,63.21-1.68,'
  + '16.98-18.34,26.73-29.98,31.66-11.01,4.72-17.09,7.86-15.51,11.43,2.73,5.87,59.02,9.43,70.23-41.83,4.51-46.86-64.15-'
  + '80.82-108.39-90.57C356.01,4.82,176.23,0,176.23,0c-26.42,126,59.44,196.86,146.65,212.58,0,0-14.68,52.2-64.78,82.5C199.82,'
  + '330.2,51.8,331.98.65,432.3c-2.52,5.03,1.57,15.62,24.74,7.34,284.39-108.07,443.93.73,461.54,4.19,9.01,1.78,16.67,'
  + '1.05,9.54-11.53h.1ZM199.92,28.62s132.18,22.54,125.58,159.54c0,0-124.74-11.95-125.58-159.54Z"/></svg>'

const STYLE = `
/* shadcn/ui's default neutral palette, both schemes, resolved to literals. */
:root {
  --background: #ffffff; --foreground: #0a0a0a;
  --muted-foreground: #737373; --border: #e5e5e5; --accent: #f5f5f5;
  --primary: #171717; --primary-foreground: #fafafa;
  --brand: #006AFF;
  /* --radius 0.625rem; rounded-md is calc(--radius - 2px). */
  --radius-md: 8px;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a; --foreground: #fafafa;
    --muted-foreground: #a1a1a1; --border: #262626; --accent: #262626;
    --primary: #fafafa; --primary-foreground: #171717;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100dvh;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  background: var(--background); color: var(--foreground);
  font: 16px/24px -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Helvetica, Arial, sans-serif;
}
/* The block's outer div: flex-col gap-6, at the max-w-sm the login page uses. */
.card { display: flex; flex-direction: column; gap: 24px; width: 100%; max-width: 384px; }
/* FieldGroup: flex-col gap-6. */
.group { display: flex; flex-direction: column; gap: 24px; }
/* The block's centred header: flex-col items-center gap-2 text-center. */
.head { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
/* size-8 box holding a size-6 glyph. */
.mark {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 6px; color: var(--brand);
}
/* text-xl font-bold. */
h1 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 700; }
/* FieldDescription: text-sm text-muted-foreground. */
.description { margin: 0; font-size: 14px; line-height: 20px; color: var(--muted-foreground); }
.description a { color: var(--foreground); text-underline-offset: 4px; }
/* Field: flex-col gap-2. */
.field { display: flex; flex-direction: column; gap: 8px; }
/* Button: h-9 rounded-md px-4, text-sm font-medium. */
.action {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; height: 36px; padding: 0 16px;
  border: 1px solid transparent; border-radius: var(--radius-md);
  background: var(--primary); color: var(--primary-foreground);
  font-size: 14px; line-height: 20px; font-weight: 500;
  text-decoration: none; cursor: pointer;
  transition: opacity 150ms ease;
}
.action:hover { opacity: 0.9; }
/* Button variant="outline". */
.action.quiet {
  background: var(--background); color: var(--foreground); border-color: var(--border);
}
.action.quiet:hover { background: var(--accent); opacity: 1; }
/* FieldSeparator: a rule with the label sitting in it. */
.separator {
  display: flex; align-items: center; gap: 12px;
  font-size: 14px; line-height: 20px; color: var(--muted-foreground);
}
.separator::before, .separator::after {
  content: ''; flex: 1 1 0; height: 1px; background: var(--border);
}
/* The device code: the one thing on this page a person must read aloud or
   compare glyph by glyph, so it is the one thing set larger than the block. */
.code {
  font: 600 24px/32px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.2em; text-align: center;
  padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--background);
}
.note { margin: 0; font-size: 14px; line-height: 20px; color: var(--muted-foreground); text-align: center; }
/* Disclosure for the device code. Closed by default: reading it is a recovery
   step, not part of signing in. */
.reveal { text-align: center; }
.reveal > summary {
  cursor: pointer; list-style: none;
  font-size: 13px; line-height: 20px; color: var(--muted-foreground);
  text-underline-offset: 4px;
}
.reveal > summary::-webkit-details-marker { display: none; }
.reveal > summary:hover { color: var(--foreground); text-decoration: underline; }
.reveal[open] > summary { margin-bottom: 8px; }
.error { color: #ef4444; }
[hidden] { display: none !important; }
`

/**
 * Render the sign-in document.
 * @param productUrl - the web product this desktop signs in against, shown so
 * the operator can see which deployment they are about to authorise.
 * @returns a complete HTML document.
 */
export function renderLoginPage(productUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in · Rabi</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<style>${STYLE}</style>
</head>
<body>
<main class="card">
  <div class="group">
    <div class="head">
      <div class="mark">${MARK}</div>
      <h1>Rabi</h1>
      <p class="description" id="lede">Sign in with your UnieAI account to continue.</p>
    </div>

    <section id="start" class="field">
      <button class="action" id="begin" type="button">Get Started</button>
    </section>

    <section id="pending" class="field" hidden>
      <a class="action" id="approve" target="_blank" rel="noopener noreferrer">Open the sign-in page</a>
      <div class="separator">Or</div>
      <button class="action quiet" id="cancel" type="button">Cancel</button>
      <p class="note">Approve at ${escapeHtml(new URL(productUrl).host)}.
        If you were asked to sign in first, sign in and then open the link
        again — this window keeps waiting either way.</p>
      <!-- The code rides in the link, so nobody has to read or type it. It is
           still here for the two cases that need it: the tab did not open, and
           checking that the code being approved is the one THIS machine
           produced — which is the whole defence against approving someone
           else's request. -->
      <details class="reveal">
        <summary>Show the code</summary>
        <div class="code" id="usercode"></div>
      </details>
    </section>

    <section id="failed" class="field" hidden>
      <p class="note error" id="reason"></p>
      <button class="action" id="retry" type="button">Try again</button>
    </section>
  </div>
</main>
<script>
(() => {
  const show = (id) => {
    for (const s of ['start', 'pending', 'failed']) document.getElementById(s).hidden = s !== id
  }
  const fail = (message) => { document.getElementById('reason').textContent = message; show('failed') }
  let cancelled = false

  const poll = async (deviceCode, intervalSeconds) => {
    if (cancelled) return
    let answer
    try {
      const r = await fetch('/auth/device/poll', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceCode }),
      })
      answer = await r.json()
    } catch (error) { return fail(String(error)) }
    if (cancelled) return
    if (answer.status === 'approved') { location.replace('/'); return }
    if (answer.status === 'pending') {
      const wait = (answer.retryAfterSeconds || intervalSeconds) * 1000
      setTimeout(() => { void poll(deviceCode, intervalSeconds) }, wait)
      return
    }
    if (answer.status === 'expired') return fail('The code expired before it was approved.')
    if (answer.status === 'denied') return fail('The request was declined.')
    fail(answer.message || 'Something went wrong.')
  }

  const begin = async (opened) => {
    cancelled = false
    const drop = () => { if (opened && !opened.closed) opened.close() }
    try {
      const r = await fetch('/auth/device/start', { method: 'POST' })
      const grant = await r.json()
      if (!r.ok) { drop(); return fail(grant.message || 'Could not reach UnieAI Copilot.') }
      document.getElementById('usercode').textContent = grant.userCode
      const link = document.getElementById('approve')
      link.href = grant.verificationUrl
      show('pending')
      // The tab was claimed during the click; point it at the grant now that
      // there is one. A browser that refused leaves no handle, and the link
      // above is the whole recovery — it is a real click, so nothing can
      // block it.
      if (opened && !opened.closed) opened.location.href = grant.verificationUrl
      void poll(grant.deviceCode, grant.interval || 3)
    } catch (error) { drop(); fail(String(error)) }
  }

  // Claim the tab INSIDE the click. A window open is only honoured while the
  // user gesture is live, and awaiting the grant first spends it — a popup
  // opened after the fetch is blocked by every browser that ships a blocker,
  // which reads to the user as "Get Started does nothing". Opening a blank tab
  // first and steering it afterwards keeps the open inside the gesture.
  // The noopener option is deliberately NOT passed: it would return null and
  // leave nothing to steer. The tab is this deployment's own web product and
  // cross-origin, so its opener handle can do nothing to this page but
  // navigate it.
  const claimTab = () => window.open('', '_blank')
  document.getElementById('begin').addEventListener('click', () => { void begin(claimTab()) })
  document.getElementById('retry').addEventListener('click', () => { void begin(claimTab()) })
  document.getElementById('cancel').addEventListener('click', () => { cancelled = true; show('start') })
})()
</script>
</body>
</html>
`
}
