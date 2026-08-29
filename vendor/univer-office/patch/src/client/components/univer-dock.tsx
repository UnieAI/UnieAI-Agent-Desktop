import * as React from 'react'
import { createPortal } from 'react-dom'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  opensFloatingWindow, turnFilesOfSession, type UniverTurnOperation,
} from '../conversation/univer-turn-definition.ts'
import { useUniverStates } from '../hooks/use-univer-state.ts'
import type { ViewerLocaleInjected } from '../viewer-locale.ts'
import { useDocumentHost } from './document-host.tsx'
import { WorktreeWindow } from './worktree-window.tsx'

export type UniverDockProps = PropsRuntime<'conversation.input.dock'> & PropsLocale<'univer'> & ViewerLocaleInjected

interface OpenWindow {
  readonly file: string
  readonly worktreeId: string | null
  readonly preferredUnitId: string | null
}

/** Own deliberate live-window intent across Turns and clear it only on dismiss or terminal state. */
export function UniverDock(props: UniverDockProps): React.ReactElement {
  return <UniverSessionDock key={props.sessionId} {...props} />
}

/** A keyed owner prevents open-window intent from crossing DSH session boundaries. */
function UniverSessionDock(props: UniverDockProps): React.ReactElement {
  const cwd = props.useSessions((state) => state.byId[props.sessionId]?.cwd)
  const turnFiles = React.useMemo(() => turnFilesOfSession(props.session, cwd), [props.session, cwd])
  const [open, setOpen] = React.useState<Record<string, OpenWindow>>({})
  const seen = React.useRef(new Set<string>())
  const running = props.session?.running === true

  React.useEffect(() => {
    const additions: OpenWindow[] = []
    for (const file of turnFiles) {
      for (const operation of file.operations) {
        if (operation.phase === 'failed' || !opensFloatingWindow(operation)) continue
        const candidate = openWindowOf(operation, file.file)
        if (candidate === null || seen.current.has(operation.callId)) continue
        seen.current.add(operation.callId)
        additions.push(candidate)
      }
    }
    if (additions.length === 0) return
    setOpen((previous) => {
      const next = { ...previous }
      for (const addition of additions) next[addition.file] = addition
      return next
    })
  }, [turnFiles])

  const files = Object.keys(open)
  const { states } = useUniverStates(running ? files : [], props.sessionId)

  React.useEffect(() => {
    setOpen((previous) => {
      let changed = false
      const next = { ...previous }
      for (const target of Object.values(previous)) {
        if (target.worktreeId === null) continue
        const worktree = states[target.file]?.worktrees.find((entry) => entry.worktreeId === target.worktreeId)
        if (worktree?.status === 'merged' || worktree?.status === 'discarded') {
          delete next[target.file]
          changed = true
        }
      }
      return changed ? next : previous
    })
  }, [states])

  // UnieAI fork divergence: the windows are docked in the shell's right column
  // rather than floated over the conversation. The dock still owns WHICH files
  // are open — only where they render changed — and it asks the shell to open
  // and close that column so the panel never sits there empty.
  const host = useDocumentHost()
  const windowCount = Object.keys(open).length
  React.useEffect(() => {
    const layout = (props as { layout?: { openDocument?: () => void; closeDocument?: () => void } }).layout
    if (windowCount > 0) layout?.openDocument?.()
    else layout?.closeDocument?.()
  }, [windowCount, props])

  if (!running) return <></>
  const windows = Object.values(open)
  const stack = windows.length === 0 ? null : <div className="uvf_root" data-docked={host === null ? undefined : 'true'}>{windows.map((target, stackIndex) => <WorktreeWindow
    docked={host !== null}
    key={target.file}
    file={target.file}
    state={states[target.file]}
    worktreeId={target.worktreeId}
    preferredUnitId={target.preferredUnitId}
    stackIndex={stackIndex}
    t={props.t}
    viewerLocale={props.getViewerLocale()}
    onDismiss={() => setOpen((previous) => {
      const next = { ...previous }
      delete next[target.file]
      return next
    })}
  />)}</div>
  // Portalled into the right column when the shell offers one; floating over
  // the conversation when it does not, which is upstream's own behaviour and
  // the only thing an older shell can render.
  return <>{stack === null ? null : host === null ? stack : createPortal(stack, host)}</>
}

function openWindowOf(operation: UniverTurnOperation, file: string): OpenWindow | null {
  if (operation.name === 'new') return { file, worktreeId: null, preferredUnitId: operation.unitId }
  if (operation.worktreeId === null) return null
  return { file, worktreeId: operation.worktreeId, preferredUnitId: operation.unitId }
}
