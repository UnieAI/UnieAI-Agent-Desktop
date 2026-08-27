/**
 * The skills destination's body: what this deployment serves, and where each
 * skill lives.
 *
 * Grouped by origin, because origin is what a person can act on. The ones
 * they wrote are theirs to edit; a project's belong to that repository and
 * travel with it; the ones this build ships are not theirs at all. A row
 * names the file so the answer to "which of these two is being used" is on
 * screen rather than inferred.
 *
 * Read when the destination opens and when someone asks again — skills are
 * files edited outside Rabi, by an editor or by the agent, and there is no
 * change stream under them to subscribe to.
 *
 * This destination lists; it does not write. A skill is a file, and the two
 * things that already write files well are the person's editor and the
 * agent — which is also how a skill gets created here: ask for one.
 */
import { useEffect } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
import { groupSkills } from './skills-view.ts'
import type { SkillsState, SkillsView } from './skills-view.ts'
// Type-only: pulls this package's SlotMap merge (the 'plugins.page.area' seat).
import type {} from './contract/slots.ts'
import css from './SkillsArea.module.css'

/** Injected business face of the skills area (slot `inject`). */
export interface SkillsAreaInjected {
  hooks: {
    /** The catalogue this deployment serves. */
    skills: SkillsView
  }
  /** Whether this composition can answer at all; false draws the plain statement instead. */
  available: boolean
  /** Read the catalogue again. */
  refresh: () => void
  /** Hand a skill's file to the person's own editor, where the host can. */
  openPath?: ((path: string) => void) | undefined
}

/** Full component props: runtime share + locale seat + injected face. */
export type SkillsAreaComponentProps =
  PropsRuntime<'plugins.page.area'> & PropsLocale<'plugins'>
  & InjectFace<SkillsAreaInjected>

/**
 * Render the skills destination.
 * @param props - see {@link SkillsAreaComponentProps}.
 * @returns the area element tree.
 */
export function SkillsArea({ t, useSkills, available, refresh, openPath }: SkillsAreaComponentProps) {
  const state: SkillsState = useSkills(snapshot => snapshot)

  useEffect(() => { if (available) refresh() }, [available, refresh])

  if (!available) {
    return (
      <section className={css.area}>
        <p className={css.note}>{t('skills.unsupported')}</p>
      </section>
    )
  }

  const groups = groupSkills(state.skills)
  return (
    <section className={css.area}>
      {/* The destination's own header already states what a skill is; a
        second copy here would be the same sentence twice on one screen. */}
      <div className={css.head}>
        <button type="button" className={css.action} onClick={() => { refresh() }} disabled={state.busy}>
          {t('skills.refresh')}
        </button>
      </div>
      {state.error !== '' && <p className={css.error}>{state.error}</p>}
      {state.loaded && groups.length === 0 && <p className={css.note}>{t('skills.empty')}</p>}
      {groups.map(group => (
        <div key={group.key} className={css.group}>
          <div className={css.groupLabel}>{t(`skills.group.${group.key}` as 'skills.group.personal')}</div>
          <ul className={css.list}>
            {group.skills.map(skill => (
              <li key={`${skill.provider}:${skill.name}`} className={css.row}>
                <div className={css.rowMain}>
                  <span className={css.name}>{skill.name}</span>
                  <span className={css.description}>{skill.description}</span>
                  {skill.path !== undefined && <span className={css.path}>{skill.path}</span>}
                </div>
                {!skill.modelInvocable && <span className={css.tag}>{t('skills.userOnly')}</span>}
                {skill.path !== undefined && openPath !== undefined && (
                  <button
                    type="button"
                    className={css.action}
                    onClick={() => { openPath(skill.path as string) }}
                  >
                    {t('skills.open')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className={css.note}>{t('skills.write')}</p>
    </section>
  )
}
