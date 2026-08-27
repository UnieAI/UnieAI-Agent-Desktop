/**
 * What the machine this conversation runs on is doing, in the session header.
 *
 * It sits immediately before the view switch, which is where a person's eye
 * already goes when they want to know about the session rather than about the
 * message in front of them — and it belongs to the machine, so it must not
 * look like a property of the view the switch names.
 *
 * SMALL, AND HONEST ABOUT WHAT IT MEASURED. Two or three bars, never a chart:
 * a header is a place to notice that a build box is pinned, not a place to
 * study it. A reading the machine could not take is ABSENT rather than zero,
 * so a container with no `/proc` shows fewer bars instead of a machine that
 * looks idle, and the panel says which readings this machine does not offer.
 *
 * Pressing it opens the rest — load averages, every accelerator, the
 * filesystem — because those are what someone reaches for once a bar has
 * already told them something is wrong.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: the header seat is declared by the conversation package.
import type {} from '@unieai/uad-client-ui-conversation/client'
import { formatBytes, gaugesOf } from './gauges-view.ts'
import type { GaugesState, GaugesView } from './gauges-view.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge.
import type {} from './locales.ts'
import css from './MachineGauges.module.css'

/** What the strip needs, bound at registration. */
export interface MachineGaugesInjected {
  hooks: {
    /** The last reading and the polling state. */
    gauges: GaugesView
  }
  /**
   * Begin polling, and return the stop.
   *
   * Owned by the view rather than by this component: a reading is a command
   * run on someone's machine, so it starts when this strip is on screen and
   * stops when it leaves — and a remount must not leave a timer behind.
   */
  startPolling: () => () => void
}

/** Full component props: header seat + locale + injected face. */
export type MachineGaugesProps =
  PropsRuntime<'conversation.session.header.gauges'> & PropsLocale<'conversation.gauges'>
  & InjectFace<MachineGaugesInjected>

/** Percent as a whole number, clamped to what a bar can draw. */
const clamp = (percent: number): number => Math.min(100, Math.max(0, percent))

/**
 * Render the gauges.
 * @param props - composed slot props.
 * @returns the strip, and its panel while open.
 */
export function MachineGauges(props: MachineGaugesProps): ReactNode {
  const { t, useGauges, startPolling } = props
  const state: GaugesState = useGauges(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)

  // Polling runs while this strip is on screen and stops with it.
  useEffect(() => startPolling(), [startPolling])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (box.current?.contains(event.target as Node) === true) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => { document.removeEventListener('mousedown', close) }
  }, [open])

  // A deployment that cannot measure anything draws nothing at all: an empty
  // strip in the header would be a control that never answers.
  if (!state.supported) return null
  const reading = state.reading
  if (reading === undefined) return null
  const gauges = gaugesOf(reading)
  if (gauges.length === 0) return null

  return (
    <div className={css.root} ref={box}>
      <button
        type="button"
        className={css.strip}
        aria-expanded={open}
        title={t('gauges.open')}
        data-stale={state.error === '' ? undefined : true}
        onClick={() => { setOpen(current => !current) }}
      >
        {gauges.slice(0, 3).map(gauge => (
          <span key={gauge.key} className={css.gauge}>
            <span className={css.label}>{t(`gauges.${gauge.key}`)}</span>
            <span className={css.bar}>
              <span className={css.fill} style={{ width: `${String(clamp(gauge.percent))}%` }} />
            </span>
          </span>
        ))}
      </button>
      {open && (
        <div className={css.panel} role="dialog" aria-label={t('gauges.title')}>
          <div className={css.panelHead}>
            <span className={css.panelTitle}>{t('gauges.title')}</span>
            <span className={css.machine}>{reading.machine}</span>
          </div>
          {state.error !== '' && <p className={css.stale}>{t('gauges.stale')}</p>}
          <ul className={css.rows}>
            {gauges.map(gauge => (
              <li key={gauge.key} className={css.row}>
                <span className={css.rowLabel}>{t(`gauges.${gauge.key}`)}</span>
                <span className={css.bar}>
                  <span className={css.fill} style={{ width: `${String(clamp(gauge.percent))}%` }} />
                </span>
                <span className={css.rowValue}>{gauge.value}</span>
              </li>
            ))}
          </ul>
          <dl className={css.facts}>
            {reading.cores !== undefined && (
              <div className={css.fact}>
                <dt>{t('gauges.cores')}</dt>
                <dd>{reading.cores}</dd>
              </div>
            )}
            {reading.load !== undefined && (
              <div className={css.fact}>
                <dt>{t('gauges.load')}</dt>
                <dd>{reading.load.map((one: number) => one.toFixed(2)).join(' · ')}</dd>
              </div>
            )}
            {reading.diskMount !== undefined && (
              <div className={css.fact}>
                <dt>{t('gauges.mount')}</dt>
                <dd>{reading.diskMount}</dd>
              </div>
            )}
          </dl>
          {/* Every accelerator, not only the first: the strip shows one
            because a header has room for one, and someone who opened this
            panel is asking about the machine rather than about the bar. */}
          {[...reading.gpus, ...reading.npus].length > 0 && (
            <ul className={css.devices}>
              {[...reading.gpus, ...reading.npus].map((device, index) => (
                <li key={`${device.name}:${String(index)}`} className={css.device}>
                  <span className={css.deviceName}>{device.name}</span>
                  <span className={css.deviceFacts}>
                    {[
                      device.utilPercent === undefined ? undefined : `${String(Math.round(device.utilPercent))}%`,
                      device.memoryUsedBytes === undefined || device.memoryTotalBytes === undefined
                        ? undefined
                        : `${formatBytes(device.memoryUsedBytes)} / ${formatBytes(device.memoryTotalBytes)}`,
                      device.temperatureC === undefined ? undefined : `${String(Math.round(device.temperatureC))}°C`,
                    ].filter((one): one is string => one !== undefined).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {reading.gpus.length === 0 && reading.npus.length === 0 && (
            <p className={css.none}>{t('gauges.noAccelerator')}</p>
          )}
        </div>
      )}
    </div>
  )
}
