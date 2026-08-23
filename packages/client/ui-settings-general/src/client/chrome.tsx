/**
 * Shell chrome content registered into the shell's trigger/header seats: the
 * trigger glyph plus its accessible-name text (the sidebar foot's identity
 * row) and the panel title text. The shell renders the surrounding chrome
 * (button, nav heading row) and reads each entry's `label` option for aria
 * text.
 */
import { IconSettingsOutline14, IconSettingsOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './chrome.module.css'

/** Trigger content props: the sidebar column state + the standard locale seat. */
export type TriggerContentProps = PropsRuntime<'settings.trigger'> & PropsLocale<'settings'>

/** Header content props: the standard locale seat only. */
export type HeaderContentProps = PropsRuntime<'settings.header'> & PropsLocale<'settings'>

/**
 * Render the trigger content: the reference column's 15px chrome gear in the
 * expanded identity row, the rail's 18px glyph collapsed. Expanded, the label
 * is the shell button's accessible name only — the row has no space for a
 * second one — so it stays in the DOM and out of the picture.
 * @param props - composed slot props.
 * @returns the trigger content fragment.
 */
export function TriggerContent({ wide, t }: TriggerContentProps) {
  return (
    <>
      {wide ? <IconSettingsOutline16 size={15} /> : <IconSettingsOutline14 size={18} />}
      {wide && <span className={css.triggerLabel}>{t('trigger')}</span>}
    </>
  )
}

/**
 * Render the panel title text.
 * @param props - composed slot props.
 * @returns the title text node.
 */
export function HeaderContent({ t }: HeaderContentProps) {
  return <>{t('title')}</>
}

/** Close-button label text props: the standard locale seat only. */
export type CloseLabelProps = PropsRuntime<'settings.close'> & PropsLocale<'settings'>

/**
 * Render the close button's visually-hidden label text.
 * @param props - composed slot props.
 * @returns the label text node.
 */
export function CloseLabel({ t }: CloseLabelProps) {
  return <>{t('close')}</>
}
