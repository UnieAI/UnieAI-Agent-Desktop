/**
 * Four small mocks of the real interface, each with a cursor that performs the
 * action once every six seconds.
 *
 * WHY A MOCK AND NOT AN ICON. An icon says a feature exists; this has to show
 * someone what to DO, because the person it is for has never used a program
 * like this. A cursor moving to a button and the button responding is the
 * shortest way to say "press that".
 *
 * PURE CSS, NO ANIMATION LIBRARY. Every step is opacity and transform on a
 * shared six-second cycle, which a stylesheet expresses directly. Pulling an
 * animation runtime into the desktop bundle to move eight boxes would be paid
 * for by everyone who never opens this.
 *
 * @module @unieai/uad-client-ui-first-run/client/Scenes
 */

import type { ReactNode } from 'react'
import { IconLaptopOutline16, IconServerOutline16 } from '@unieai/uad-client-ui-primitives'
import css from './Scenes.module.css'

/** The pointer every scene drives; its path is the scene's own keyframes. */
function Cursor({ className }: { className: string }): ReactNode {
  return (
    <svg className={`${css['cursor'] as string} ${className}`} viewBox="0 0 12 16" aria-hidden="true">
      <path d="M1 1l9 7.5-4.2.6 2.4 4.6-2 1-2.3-4.6-2.9 2.6z" />
    </svg>
  )
}

/** A folder, at the size the mock's rows use. */
function Folder(): ReactNode {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1.5 3.6c0-.6.5-1.1 1.1-1.1h3.1c.3 0 .6.1.8.4l.9 1h5c.6 0 1.1.5 1.1 1.1v7.4c0 .6-.5 1.1-1.1 1.1H2.6c-.6 0-1.1-.5-1.1-1.1V3.6Z" />
    </svg>
  )
}

/** Step one: the hero asks for a folder, and one is picked. */
export function SceneFolder({ t }: { t: (key: 'scene.hero' | 'scene.pick' | 'scene.folders') => string }): ReactNode {
  return (
    <div className={css['scene']}>
      <div className={css['hero']}>
        <span className={css['heroText']}>{t('scene.hero')}</span>
        <span className={css['heroButton']}><Folder />{t('scene.pick')}</span>
      </div>
      <div className={css['sheet']}>
        <div className={css['sheetHead']}>{t('scene.folders')}</div>
        <div className={css['sheetRow']}><Folder /><i /></div>
        <div className={`${css['sheetRow'] as string} ${css['sheetPick'] as string}`}><Folder /><i /></div>
        <div className={css['sheetRow']}><Folder /><i /></div>
      </div>
      <Cursor className={css['cursorFolder'] as string} />
    </div>
  )
}

/** Step two: a question is typed and sent, and an answer comes back. */
export function SceneAsk({ t }: { t: (key: 'scene.prompt') => string }): ReactNode {
  return (
    <div className={css['scene']}>
      <div className={css['chat']}>
        <div className={css['reply']}><i /><i /><i /></div>
        <div className={css['mine']}>{t('scene.prompt')}</div>
        <div className={css['composer']}>
          <span className={css['typed']}>{t('scene.prompt')}</span>
          <span className={css['send']}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 13V3" /><path d="M3.5 7.5 8 3l4.5 4.5" />
            </svg>
          </span>
        </div>
      </div>
      <Cursor className={css['cursorAsk'] as string} />
    </div>
  )
}

/** Step three: a change is proposed, approved, and confirmed. */
export function SceneReview({ t }: { t: (key: 'scene.file' | 'scene.no' | 'scene.yes' | 'scene.done') => string }): ReactNode {
  return (
    <div className={css['scene']}>
      <div className={css['fileHead']}>{t('scene.file')}</div>
      <div className={css['diff']}>
        <div className={css['removed']}>- 2026-03,,,</div>
        <div className={css['added']}>+ 2026-03,Taipei,12,48200</div>
      </div>
      <div className={css['actions']}>
        <span className={css['ghost']}>{t('scene.no')}</span>
        <span className={css['primary']}>{t('scene.yes')}</span>
      </div>
      <div className={css['settled']}>
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
        {t('scene.done')}
      </div>
      <Cursor className={css['cursorReview'] as string} />
    </div>
  )
}

/** Step four: the machine picker opens and another machine is chosen. */
export function SceneMachine({ t }: { t: (key: 'scene.here' | 'scene.there' | 'scene.hero') => string }): ReactNode {
  return (
    <div className={css['scene']}>
      <div className={css['menu']}>
        <div className={css['menuRow']}><IconLaptopOutline16 size={12} />{t('scene.here')}</div>
        <div className={`${css['menuRow'] as string} ${css['menuPick'] as string}`}><IconServerOutline16 size={12} />{t('scene.there')}</div>
      </div>
      <div className={css['row']}>
        <span className={css['rowText']}>{t('scene.hero')}</span>
        <span className={css['rowChip']}><IconServerOutline16 size={11} />{t('scene.there')}</span>
        <span className={css['rowIcon']}><IconLaptopOutline16 size={13} /></span>
      </div>
      <Cursor className={css['cursorMachine'] as string} />
    </div>
  )
}
