import type { HeroBrandMarkOwnerProps } from '@unieai/uad-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@unieai/uad-client-ui-sidebar/client'
import css from './Brand.module.css'

/** Intrinsic proportions of the UnieAI mark artwork. */
const MARK_VIEWBOX_WIDTH = 499.28
const MARK_VIEWBOX_HEIGHT = 444.55

/**
 * The UnieAI mark outline, in the artwork's own coordinate system. Drawn with
 * `currentColor` so the colour lives in CSS beside the theme tokens rather
 * than in this path data.
 */
const MARK_PATH
  = 'm496.58,432.3c-7.44-13.21-219.4-145.81-455.36-17.82,0,0-3.98-2.73,6.18-10.69,9.96-7.86,49.58-32.18,124.43-55.66,'
  + '74.74-26.21,149.17-29.56,177.26-130.4,58.7,18.55,86.06,48.64,84.7,63.21-1.68,16.98-18.34,26.73-29.98,31.66-11.01,'
  + '4.72-17.09,7.86-15.51,11.43,2.73,5.87,59.02,9.43,70.23-41.83,4.51-46.86-64.15-80.82-108.39-90.57C356.01,4.82,'
  + '176.23,0,176.23,0c-26.42,126,59.44,196.86,146.65,212.58,0,0-14.68,52.2-64.78,82.5C199.82,330.2,51.8,331.98.65,'
  + '432.3c-2.52,5.03,1.57,15.62,24.74,7.34,284.39-108.07,443.93.73,461.54,4.19,9.01,1.78,16.67,1.05,9.54-11.53h.1Z'
  + 'M199.92,28.62s132.18,22.54,125.58,159.54c0,0-124.74-11.95-125.58-159.54Z'

type UnieAiBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/**
 * Render the UnieAI mark at the size its host surface requests.
 * @param props - Host-supplied mark presentation.
 * @returns the UnieAI mark.
 */
export function UnieAiBrandMark({ size, className }: UnieAiBrandMarkProps) {
  return (
    <svg
      width={size}
      height={(size * MARK_VIEWBOX_HEIGHT) / MARK_VIEWBOX_WIDTH}
      className={className === undefined ? css.mark : `${css.mark} ${className}`}
      viewBox={`0 0 ${MARK_VIEWBOX_WIDTH} ${MARK_VIEWBOX_HEIGHT}`}
      fill="none"
      aria-hidden="true"
    >
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  )
}

/**
 * Render the product name. The product ships no wordmark artwork, so the name
 * is set in the product typeface rather than drawn.
 * @returns the product name.
 */
export function UnieAiBrandName() {
  return <span className={css.name}>Rabi</span>
}
