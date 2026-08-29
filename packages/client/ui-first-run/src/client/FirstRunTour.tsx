/**
 * The tour a person meets once, on the first run.
 *
 * WHY IT EXISTS. Everything else in this shell assumes someone who has used a
 * program like this before: the first screen asks for a "workspace", the
 * composer offers an access mode, and nothing says what the agent will do with
 * the folder it is given. For the person this product is now for, that is four
 * unfamiliar decisions before the first sentence.
 *
 * WHY ONCE, AND SKIPPABLE FROM THE FIRST FRAME. A tour that returns is a tax
 * on everyone who already knows, and one that cannot be dismissed is worse
 * than none — so `Skip` sits beside the step counter rather than at the end of
 * the sequence, and finishing or skipping are the same durable answer.
 *
 * @module @unieai/uad-client-ui-first-run/client/FirstRunTour
 */

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from '@unieai/uad-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: the overlay seat is declared by ui-layout.
import type {} from '@unieai/uad-client-ui-layout/client'
import { SceneAsk, SceneFolder, SceneMachine, SceneReview } from './Scenes.tsx'
import { TOUR, positionOf } from './tour.ts'
// Type-only: pulls this package's LocaleNamespaceMap merge.
import type {} from './locales.ts'
import css from './FirstRunTour.module.css'

/** What the tour needs, bound at registration. */
export interface FirstRunInjected {
  hooks: {
    /** Whether this person has been shown the tour. */
    seen: {
      getSnapshot: () => boolean
      subscribe: (listener: () => void) => () => void
    }
  }
  /** Record that they have; called once, by finishing or skipping. */
  settle: () => void
}

/** Full component props: overlay seat + locale + injected face. */
export type FirstRunTourProps =
  PropsRuntime<'shell.overlay'> & PropsLocale<'first-run'> & InjectFace<FirstRunInjected>

/**
 * Render the tour while it is owed, and nothing once it is not.
 * @param props - composed slot props.
 * @returns the dialog, or null.
 */
export function FirstRunTour(props: FirstRunTourProps): ReactNode {
  const { t, useSeen, settle } = props
  const seen: boolean = useSeen(snapshot => snapshot)
  const [index, setIndex] = useState(0)
  // Closing is this component's own answer, not the setting's. The write is a
  // round trip and may not settle at all where preferences are held in memory;
  // a dialog that stayed up until storage agreed would look like a control
  // that does not work.
  const [dismissed, setDismissed] = useState(false)
  const position = positionOf(index)
  const step = TOUR[position.index]

  const finish = useCallback(() => { setDismissed(true); settle() }, [settle])
  const forward = useCallback(() => {
    setIndex((current) => {
      if (positionOf(current).isLast) { setDismissed(true); settle(); return current }
      return current + 1
    })
  }, [settle])

  if (seen || dismissed || step === undefined) return null

  const scene = step.scene === 'folder'
    ? <SceneFolder t={t} />
    : step.scene === 'ask'
      ? <SceneAsk t={t} />
      : step.scene === 'review' ? <SceneReview t={t} /> : <SceneMachine t={t} />

  return (
    <Modal
      open
      onClose={finish}
      title={t('title')}
      closeLabel={t('skip')}
      className={css['dialog'] as string}
      footer={(
        <>
          <span className={css['count']}>
            {t('step', { n: String(position.index + 1), total: String(TOUR.length) })}
          </span>
          {position.hasPrevious && (
            <Button variant="outline" onClick={() => { setIndex(current => current - 1) }}>{t('back')}</Button>
          )}
          <Button variant="primary" onClick={forward}>{position.isLast ? t('done') : t('next')}</Button>
        </>
      )}
    >
      <div className={css['stage']}>{scene}</div>
      <h3 className={css['heading']}>{t(step.title)}</h3>
      <p className={css['body']}>{t(step.body)}</p>
      <div className={css['dots']} aria-hidden="true">
        {TOUR.map((entry, dot) => (
          <span key={entry.scene} className={dot === position.index ? css['dotOn'] : css['dot']} />
        ))}
      </div>
    </Modal>
  )
}
