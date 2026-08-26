/**
 * The mascot itself: one canvas, one sprite sheet, one animation row chosen by
 * what the agent is doing.
 *
 * Canvas rather than a CSS sprite because the sheet is a 1536×1872 grid and
 * the frame changes on a clock, not on a hover: stepping `background-position`
 * from a timer costs a style recalculation per frame on an element that sits
 * above the whole app.
 *
 * It draws only while something is moving. An idle mascot on a machine nobody
 * is using should not hold a repaint loop open, and a hidden tab should not
 * animate at all.
 */

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { frameAt, frameRect, FRAME_HEIGHT, FRAME_WIDTH, stateFor } from '../codex.ts'
import type { PetReaction } from '../codex.ts'
import css from './PetSprite.module.css'

/** What the mascot needs to draw itself. */
export interface PetSpriteProps {
  /** Pet id; names the sheet served under `/pets/<id>/spritesheet.webp`. */
  petId: string
  /** What the agent is doing. */
  reaction: PetReaction
  /** Rendered edge length in CSS pixels. */
  size?: number
}

/**
 * Draw the mascot.
 * @param props - pet, reaction and size.
 * @returns the canvas.
 */
export function PetSprite({ petId, reaction, size = 64 }: PetSpriteProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const reactionRef = useRef(reaction)
  reactionRef.current = reaction

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return
    const context = canvas.getContext('2d')
    if (context === null) return

    const sheet = new Image()
    sheet.src = `/pets/${encodeURIComponent(petId)}/spritesheet.webp`
    let frameHandle = 0
    let stopped = false
    let lastKey = ''

    const paint = (): void => {
      if (stopped || !sheet.complete || sheet.naturalWidth === 0) return
      const state = stateFor(reactionRef.current)
      const frame = frameAt(state, performance.now())
      // One draw per FRAME, not per animation tick: the row and index together
      // decide the picture, and repainting an unchanged picture is the cost
      // this guard exists to avoid.
      const key = `${String(state.row)}:${String(frame)}`
      if (key === lastKey) return
      lastKey = key
      const { x, y } = frameRect(state, frame)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.imageSmoothingEnabled = false
      context.drawImage(sheet, x, y, FRAME_WIDTH, FRAME_HEIGHT, 0, 0, canvas.width, canvas.height)
    }

    const loop = (): void => {
      if (stopped) return
      paint()
      frameHandle = requestAnimationFrame(loop)
    }

    const start = (): void => {
      if (stopped || frameHandle !== 0) return
      frameHandle = requestAnimationFrame(loop)
    }
    const stop = (): void => {
      if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
      frameHandle = 0
    }

    // A hidden tab gets no frames at all: the browser would throttle them
    // anyway, and a mascot nobody can see has no reason to hold the loop.
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    sheet.addEventListener('load', () => { lastKey = ''; start() })
    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()

    return () => {
      stopped = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [petId])

  return (
    <canvas
      ref={canvasRef}
      className={css['sprite']}
      width={FRAME_WIDTH}
      height={FRAME_HEIGHT}
      style={{ width: `${String(size)}px`, height: `${String(Math.round((size * FRAME_HEIGHT) / FRAME_WIDTH))}px` }}
      role="img"
      aria-label={reaction === 'idle' ? 'mascot' : `mascot: ${reaction}`}
    />
  )
}
