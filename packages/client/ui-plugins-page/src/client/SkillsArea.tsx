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
import type { AccountSkillsSnapshot, AccountSkillsView } from './account-skills-source.ts'
// Type-only: pulls this package's SlotMap merge (the 'plugins.page.area' seat).
import type {} from './contract/slots.ts'
import css from './SkillsArea.module.css'

/** Injected business face of the skills area (slot `inject`). */
export interface SkillsAreaInjected {
  hooks: {
    /** The catalogue this deployment serves. */
    skills: SkillsView
    /** The signed-in UnieAI account's own skills. */
    accountSkills: AccountSkillsView
  }
  /** Whether this composition can answer at all; false draws the plain statement instead. */
  available: boolean
  /** Read the catalogue again. */
  refresh: () => void
  /** Hand a skill's file to the person's own editor, where the host can. */
  openPath?: ((path: string) => void) | undefined
  /** Read the account's own list again. */
  refreshAccount: () => void
  /** Copy one of the account's skills onto this machine. */
  copyFromAccount: (slug: string) => void
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
export function SkillsArea({
  t, useSkills, useAccountSkills, available, refresh, openPath, refreshAccount, copyFromAccount,
}: SkillsAreaComponentProps) {
  const state: SkillsState = useSkills(snapshot => snapshot)
  const fromAccount: AccountSkillsSnapshot = useAccountSkills(snapshot => snapshot)

  useEffect(() => { if (available) refresh() }, [available, refresh])
  // Asked once when the destination opens. A build with no account gate
  // answers 404, which the source reads as `unsupported` and the section then
  // draws nothing — the same shape the Studio MCP area uses, and the same
  // accepted cost of one console line per open on such a build.
  useEffect(() => { refreshAccount() }, [refreshAccount])

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
      <AccountSkills
        t={t} snapshot={fromAccount} local={state.skills.map(skill => skill.name)}
        copy={copyFromAccount}
      />
    </section>
  )
}

/** What the account section renders from. */
interface AccountSkillsProps {
  t: SkillsAreaComponentProps['t']
  snapshot: AccountSkillsSnapshot
  /** Names already on this machine, so a copy is not offered as if it were new. */
  local: readonly string[]
  copy: (slug: string) => void
}

/**
 * The account's own skills, and the copy gesture.
 *
 * Drawn under this machine's catalogue rather than mixed into it, because the
 * two answer different questions: the catalogue above is what a turn here will
 * use, and this is what exists somewhere else and could be brought over. A
 * merged list would have to say which of the two each row was, on every row.
 *
 * Only `ready` draws rows. The other answers each keep their own sentence: a
 * build with no gate says nothing at all (the section does not render), a
 * signed-out browser is told to sign in, and a failed read says so — there is
 * no retry control, because the destination's own Read again already re-asks
 * both lists.
 * @param props - see {@link AccountSkillsProps}.
 * @returns the section, or null where there is nothing to say.
 */
function AccountSkills({ t, snapshot, local, copy }: AccountSkillsProps) {
  const { state } = snapshot
  if (state.status === 'idle' || state.status === 'unsupported') return null
  const known = new Set(local)

  return (
    <div className={css.group}>
      <div className={css.groupLabel}>{t('skills.group.account')}</div>
      {state.status === 'loading' && <p className={css.note}>{t('skills.accountLoading')}</p>}
      {state.status === 'signed-out' && <p className={css.note}>{t('skills.accountSignedOut')}</p>}
      {state.status === 'failed' && (
        <p className={css.error}>{state.message === '' ? t('skills.accountFailed') : state.message}</p>
      )}
      {snapshot.error !== '' && <p className={css.error}>{snapshot.error}</p>}
      {state.status === 'ready' && state.skills.length === 0 && (
        <p className={css.note}>{t('skills.accountEmpty')}</p>
      )}
      {state.status === 'ready' && (
        <ul className={css.list}>
          {state.skills.map((skill) => {
            const done = snapshot.copied[skill.slug]
            const busy = snapshot.copying.includes(skill.slug)
            return (
              <li key={skill.slug} className={css.row}>
                <div className={css.rowMain}>
                  <span className={css.name}>{skill.name}</span>
                  <span className={css.description}>{skill.description}</span>
                  {done !== undefined && <span className={css.path}>{done.path}</span>}
                  {/* Named, not fetched: the account keeps these files and the
                    copy brings only the skill body, so a skill that needs them
                    says so here rather than failing mid-turn. */}
                  {done === undefined && skill.attachments.length > 0 && (
                    <span className={css.path}>{t('skills.accountAttachments')}</span>
                  )}
                </div>
                {/* A name already on this machine is not necessarily this
                  skill, so the word is "replace" rather than "installed": the
                  person decides, and the row does not claim they are the same
                  file. */}
                <button
                  type="button" className={css.action} disabled={busy}
                  onClick={() => { copy(skill.slug) }}
                >
                  {busy
                    ? t('skills.copying')
                    : done !== undefined
                      ? t('skills.copyAgain')
                      : known.has(skill.name) ? t('skills.replace') : t('skills.copy')}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
