/**
 * The details column: a tab container over everything the column can show.
 *
 * Every open thing is a tab — the workspace tree, one file, what this session
 * produced, one selected tool call — and `+` offers the same menu the empty
 * column shows. This replaced a panel that WAS one selected call: opening
 * anything took the switcher away with it, so there was no way back except
 * closing the column, and nothing the column could answer on its own was
 * reachable at all.
 *
 * The selected call is a tab like the others, but its selection lives in the
 * shared chat store rather than here, because the transcript writes it too.
 */

import { Fragment, useEffect, useState } from 'react'
import { CodeBlock, Menu } from '@unieai/uad-client-ui-primitives'
import { shallowEqual } from '@unieai/uad-client-runtime/client'
import type { ConversationSnapshot, RunningToolCall, ToolCallBlock, ToolResultNode } from '@unieai/uad-client-runtime/client'
import type { DetailsSlotProps } from '../contract/slots.ts'
import { findToolCall } from '../chat/tool-node-reader.ts'
import { collectArtifacts, fileName, sameArtifacts, type SessionArtifact } from './artifacts.ts'
import { FileBrowser } from './FileBrowser.tsx'
import { PANEL_ITEMS, PanelItemIcon, PanelMenu, type PanelItemId } from './PanelMenu.tsx'
import { TerminalTab } from './TerminalTab.tsx'
import css from './DetailsPanel.module.css'

/** Full props composed by reference from the contract (automatic shares & injected share). */
export type DetailsPanelProps = DetailsSlotProps

/**
 * Selected call material: the call's display name and args plus the frozen
 * block slice it came from. `block` is a snapshot-cached reference, so the
 * wrapper stays shallow-equal across unrelated snapshot frames; the settled /
 * running split is read off it with the `'kind' in block` discrimination
 * instead of duplicated as flags.
 */
interface CallMaterial {
  name: string
  argsRaw: string | null
  block: ToolCallBlock
}

/** Material of a settled result node (native call or run_code sub-dispatch). */
function settledMaterial(node: ToolResultNode, callId: string): CallMaterial {
  return { name: node.call?.name ?? callId, argsRaw: node.call?.argsRaw ?? null, block: node }
}

/** Material of an in-flight call (native call or run_code sub-dispatch). */
function runningMaterial(call: RunningToolCall): CallMaterial {
  return { name: call.name, argsRaw: call.argsRaw, block: call }
}

function materialFor(s: ConversationSnapshot, callId: string): CallMaterial | null {
  const found = findToolCall(s, callId)
  if (found === undefined) return null
  return 'kind' in found ? settledMaterial(found, callId) : runningMaterial(found)
}

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    // Not JSON (streaming fragment or plain text): show verbatim.
    return raw
  }
}

/** Flatten a settled result for the no-ui-tool fallback. */
function rawResultText(block: ToolCallBlock): string {
  if (!('kind' in block)) return ''
  const parts = block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  if (parts.length === 0 && block.error !== undefined) parts.push(`${block.error.name}: ${block.error.code}`)
  return parts.join('\n')
}

/**
 * What this session produced, listed where the panel would otherwise say
 * "select a tool row".
 *
 * The panel's empty state was a instruction to go and click something. The
 * same column can answer "what came out of this conversation" instead, from
 * data it already has, and each row is the click it was asking for.
 * @param props - the artifacts and the row-selection callback.
 * @returns the list, or the original empty note when the session wrote nothing.
 */
function Artifacts(
  { rows, onSelect, t }: {
    rows: readonly SessionArtifact[]
    onSelect: (row: SessionArtifact) => void
    t: DetailsPanelProps['t']
  },
) {
  if (rows.length === 0) return <div className={css.empty}>{t('artifacts.empty')}</div>
  return (
    <section className={css.section}>
      <div className={css.sectionLabel}>{t('artifacts.title')}</div>
      <ul className={css.artifacts}>
        {rows.map((row, index) => (
          // The same path written twice is two acts, and the second may have
          // failed, so rows are keyed by position rather than by path.
          <li key={`${row.callId}:${String(index)}`}>
            <button
              type="button" className={css.artifact} data-state={row.state}
              onClick={() => { onSelect(row) }}
            >
              <span className={css.artifactName}>
                {fileName(row.path)}
                {row.state === 'error' ? ` — ${t('artifacts.failed')}` : ''}
                {row.state === 'running' ? ` — ${t('artifacts.writing')}` : ''}
              </span>
              <span className={css.artifactPath} title={row.path}>{row.path}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One open tab. `key` is stable so React keeps per-tab state across reorders. */
type PanelTab =
  | { key: string; kind: 'produced' }
  | { key: string; kind: 'files' }
  | { key: string; kind: 'file'; path: string }
  | { key: string; kind: 'terminal'; title?: string; terminalId?: string | undefined }
  | { key: string; kind: 'selection'; callId: string }

/**
 * The glyph a tab leads with, by what it holds.
 *
 * A strip of same-looking capsules is read by its labels alone, which are
 * truncated at 156px; the glyph is what survives the truncation.
 * @param kind - the tab's discriminant.
 * @returns the glyph.
 */
function TabIcon({ kind }: { kind: PanelTab['kind'] }) {
  if (kind === 'file') {
    return (
      <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden>
        <path
          d="M3.25 1.75h4.5l3 3v7.5a.75.75 0 0 1-.75.75h-6.75a.75.75 0 0 1-.75-.75V2.5a.75.75 0 0 1 .75-.75z"
          fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"
        />
        <path d="M7.75 1.75v3h3" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>
    )
  }
  if (kind === 'files') {
    return (
      <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden>
        <path
          d="M1.5 3.75a.75.75 0 0 1 .75-.75h2.75l1.25 1.25h5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-.75.75h-9a.75.75 0 0 1-.75-.75z"
          fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind === 'terminal') {
    return (
      <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden>
        <rect x="1.5" y="2.5" width="11" height="9" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <path
          d="M4 5.75 5.75 7 4 8.25M7.25 9h3"
          fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (kind === 'produced') {
    return (
      <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden>
        <rect x="2" y="2.5" width="10" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
        <path d="M4.5 7h5M7 4.5v5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden>
      <path
        d="M5.25 2.5 2 7l3.25 4.5M8.75 2.5 12 7l-3.25 4.5"
        fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

/** The tab an `open` menu item creates. */
function tabFor(id: PanelItemId): PanelTab {
  if (id === 'files') return { key: 'files', kind: 'files' }
  if (id === 'terminal') return { key: 'terminal', kind: 'terminal' }
  return { key: 'produced', kind: 'produced' }
}

export function DetailsPanel({
  useSession, useSessions, sessionId, useStore, actions, renderSlot, closeDetails,
  toggleDetailsMaximized, listWorkspaceEntries, readWorkspaceFile, openFile, canOpenFileHere,
  terminals, t,
}: DetailsPanelProps) {
  const [tabs, setTabs] = useState<PanelTab[]>([])
  const [activeKey, setActiveKey] = useState<string | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)

  const selection = useStore(s => s.selection)
  const sessionCwd = useSessions(list => list.byId[sessionId]?.cwd)
  const callId = selection?.callId
  const material = useSession(
    s => (callId === undefined ? null : materialFor(s, callId)),
    (a, b) => shallowEqual(a, b))
  const artifacts = useSession(collectArtifacts, sameArtifacts)

  /** Add a tab, or focus the one that is already showing that thing. */
  const open = (tab: PanelTab): void => {
    setTabs(current => current.some(one => one.key === tab.key) ? current : [...current, tab])
    setActiveKey(tab.key)
  }

  const close = (key: string): void => {
    setTabs((current) => {
      const next = current.filter(one => one.key !== key)
      setActiveKey(previous => previous === key ? next[next.length - 1]?.key : previous)
      return next
    })
    // Closing the call's tab clears the selection: the transcript reads the
    // same store, and a highlighted row with no panel behind it is a lie.
    if (key === 'selection') actions.select(null)
    // Closing a terminal's tab ENDS it. The terminal outliving its panel is
    // what makes reopening safe; outliving the close of its own tab would
    // leave a shell no surface can reach, holding a per-workspace slot.
    if (key === 'terminal') {
      const closing = tabs.find(one => one.key === 'terminal')
      if (closing?.kind === 'terminal' && closing.terminalId !== undefined) {
        void terminals.close(closing.terminalId)
      }
    }
  }

  // A selection can arrive from the transcript, so the tab follows it rather
  // than waiting to be opened here.
  useEffect(() => {
    if (callId === undefined) {
      setTabs(current => current.filter(one => one.kind !== 'selection'))
      return
    }
    // `open` is recreated per render and closes over nothing that changes here,
    // so the effect tracks the call alone.
    open({ key: 'selection', kind: 'selection', callId })
  }, [callId])

  const active = tabs.find(one => one.key === activeKey)

  /** The label a tab carries in the strip. */
  const labelOf = (tab: PanelTab): string => {
    if (tab.kind === 'file') return fileName(tab.path)
    if (tab.kind === 'files') return t('panel.files')
    if (tab.kind === 'terminal') return tab.title ?? t('panel.terminal')
    if (tab.kind === 'produced') return t('panel.produced')
    return material?.name ?? selection?.toolName ?? t('details.title')
  }

  return (
    <div className={css.root}>
      <div className={css.strip}>
        <div className={css.tabs} role="tablist">
          {tabs.map(tab => (
            <span key={tab.key} className={css.tab} data-active={tab.key === activeKey || undefined}>
              <button
                type="button" role="tab" className={css.tabOpen} aria-selected={tab.key === activeKey}
                onClick={() => { setActiveKey(tab.key) }}
              >
                <span className={css.tabIcon}><TabIcon kind={tab.kind} /></span>
                <span className={css.tabLabel}>{labelOf(tab)}</span>
              </button>
              <button
                type="button" className={css.tabClose} aria-label={t('details.closeTab')}
                onClick={() => { close(tab.key) }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        {/* The shared portalled Menu, not a hand-rolled dropdown. The details
            column clips its overflow, so an absolutely-positioned card inside
            it is cut off at the column edge — which is exactly the case
            `portal` exists for. The previous hand-rolled one also painted with
            a colour token that does not exist anywhere in this product, so it
            came out very nearly transparent on top of being clipped. */}
        <Menu
          open={menuOpen}
          onClose={() => { setMenuOpen(false) }}
          items={PANEL_ITEMS.map(item => ({
            id: item.id,
            label: t(item.label),
            icon: <PanelItemIcon id={item.id} />,
          }))}
          onSelect={(id) => {
            setMenuOpen(false)
            open(tabFor(id as PanelItemId))
          }}
          align="end"
          portal
          anchor={(
            <button
              type="button" className={css.plus} aria-label={t('panel.open')}
              aria-haspopup="menu" aria-expanded={menuOpen}
              onClick={() => { setMenuOpen(current => !current) }}
            >
              +
            </button>
          )}
        />
        <button
          type="button" className={css.widen} aria-label={t('details.maximize')}
          title={t('details.maximize')}
          onClick={() => { toggleDetailsMaximized() }}
        >
          {/* Both glyphs ship; which one shows follows the frame's
              `data-details-maximized`, so the icon cannot disagree with the
              layout it describes. */}
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className={css.widenOut}>
            <path
              d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5l-4.75 4.75M2.5 13.5l4.75-4.75"
              fill="none" stroke="currentColor" strokeWidth="1.3"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className={css.widenIn}>
            <path
              d="M13.5 2.5l-4.25 4.25M8.75 2.75v4.5h4.5M2.5 13.5l4.25-4.25M7.25 13.25v-4.5h-4.5"
              fill="none" stroke="currentColor" strokeWidth="1.3"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button" className={css.close} aria-label={t('details.close')}
          onClick={() => { closeDetails() }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {active === undefined
        ? (
          <div className={css.empty}>
            <PanelMenu placement="panel" t={t} onOpen={(id) => { open(tabFor(id)) }} />
          </div>
        )
        : active.kind === 'terminal'
          ? sessionCwd === undefined
            ? <div className={css.note}>{t('files.noWorkspace')}</div>
            : (
              // Keyed on the workspace: pointing the panel at a different
              // workspace is a different shell, not the same one relocated.
              <TerminalTab
                key={sessionCwd} workspaceId={sessionCwd} cwd={sessionCwd}
                terminals={terminals} t={t}
                onNamed={(title) => {
                  setTabs(current => current.map(one =>
                    one.kind === 'terminal' ? { ...one, title } : one))
                }}
                onAttached={(terminalId) => {
                  setTabs(current => current.map(one =>
                    one.kind === 'terminal' ? { ...one, terminalId } : one))
                }}
              />
            )
          : active.kind === 'files' || active.kind === 'file'
            ? sessionCwd === undefined
              ? <div className={css.note}>{t('files.noWorkspace')}</div>
              : (
                <FileBrowser
                  root={sessionCwd} list={listWorkspaceEntries} read={readWorkspaceFile} t={t}
                  {...active.kind === 'file' ? { path: active.path } : {}}
                  onOpen={(path) => { open({ key: `file:${path}`, kind: 'file', path }) }}
                  onOpenExternally={canOpenFileHere ? (path) => { void openFile(path) } : undefined}
                />
              )
            : active.kind === 'produced'
              ? (
                <div className={css.body}>
                  <Artifacts
                    rows={artifacts} t={t}
                    onSelect={(row) => { actions.select({ turnSeq: row.turnSeq, callId: row.callId, toolName: row.tool }) }}
                  />
                </div>
              )
              : (
                <div className={css.body}>
                  {material === null
                    ? <div className={css.note}>{t('details.notInWindow')}</div>
                    : (
                      <>
                        {material.argsRaw !== null && (
                          <section className={css.section}>
                            <div className={css.sectionLabel}>{t('details.input')}</div>
                            <CodeBlock code={pretty(material.argsRaw)} lang="json" copyLabel={t('copy')} copiedLabel={t('copied')} />
                          </section>
                        )}
                        <section className={css.section}>
                          <div className={css.sectionLabel}>{t('details.output')}</div>
                          {/* Keyed by the call: the body owns per-call view state
                            the panel would otherwise carry into the next one. */}
                          <Fragment key={active.callId}>
                            {renderSlot('conversation.details.tool', { block: material.block, cwd: sessionCwd }, {
                              fallback: 'kind' in material.block
                                ? (
                                  <pre className={css.code} data-error={material.block.isError || undefined}>
                                    {rawResultText(material.block)}
                                  </pre>
                                )
                                : <div className={css.note}>{t('details.running')}</div>,
                            })}
                          </Fragment>
                        </section>
                      </>
                    )}
                </div>
              )}
    </div>
  )
}
