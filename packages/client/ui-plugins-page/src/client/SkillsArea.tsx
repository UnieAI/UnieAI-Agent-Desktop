/**
 * The skills destination's body: the explicit statement that this build has no
 * account-level skill catalogue.
 *
 * WHY THERE IS NOTHING TO LIST. A skill in this product belongs to the project
 * a session runs in, and the only way to enumerate one is `skill.list`, which
 * is addressed by `sessionId` (packages/host/apiproxy/src/api/skills.ts). This
 * surface is root-scoped: it opens with or without a current session, so there
 * is no session to address and no route that answers without one. Nothing on
 * the wire reports installed, personal, system or recommended skills either.
 *
 * So the destination says that, and draws no search field, no segmented
 * control and no rows. A strip of controls over an empty list would promise a
 * catalogue that does not exist, and a fabricated one would be this package
 * inventing the product's contents.
 *
 * It is a registered `plugins.page.area` rather than a branch inside the
 * surface, so the day a root-scoped catalogue exists this entry is replaced by
 * one that reads it and nothing about the surface changes.
 */
import type { InjectFace, PropsLocale, PropsRuntime } from '@unieai/uad-client-ui-slots'
// Type-only: pulls this package's SlotMap merge (the 'plugins.page.area' seat).
import type {} from './contract/slots.ts'
import css from './SkillsArea.module.css'

/**
 * Injected business face of the skills area (slot `inject`).
 *
 * Empty, and deliberately so: there is no source to bind and no gesture this
 * build can honour. The face exists because every entry has one, and because a
 * later entry that does read a catalogue fills it in rather than adding it.
 */
export interface SkillsAreaInjected {
  /** Marker field: this area binds no source and performs no action. */
  hooks?: never
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
export function SkillsArea({ t }: SkillsAreaComponentProps) {
  return (
    <section className={css.area}>
      <p className={css.note}>{t('skills.unsupported')}</p>
    </section>
  )
}
