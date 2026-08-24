/**
 * Web application entry: thin bootstrap over the shell library. Everything —
 * module-table seeding, the boot page, and the UI-renderer handoff — lives
 * in @unieai/uad-client-web; this file only finds the mount point.
 */
import { AppWebEntry } from '@unieai/uad-client-web'
// The terminal panel's renderer needs its own global stylesheet: xterm writes
// `.xterm*` class names into the DOM itself and positions every row from them,
// so an unstyled terminal is a pile of overlapping text. It loads here rather
// than in the panel's package because it is a GLOBAL sheet (CSS modules would
// rename the classes) and because vite — not the packages' tsdown build — is
// what resolves a stylesheet from a dependency.
import '@xterm/xterm/css/xterm.css'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
void new AppWebEntry(el).run()
