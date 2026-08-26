/**
 * The sprite grid arithmetic, which is the whole correctness surface of the
 * mascot: a wrong frame index draws part of the neighbouring animation, and
 * nothing throws when it does.
 */
import { describe, expect, it } from 'vitest'
import { CODEX_STATES, FRAME_HEIGHT, FRAME_WIDTH, frameAt, frameRect, stateFor } from '../src/codex.ts'

describe('choosing a frame', () => {
  it('walks the row over one loop and starts again', () => {
    const idle = CODEX_STATES.idle
    const per = idle.durationMs / idle.frames
    expect(frameAt(idle, 0)).toBe(0)
    expect(frameAt(idle, per * 3 + 1)).toBe(3)
    expect(frameAt(idle, idle.durationMs)).toBe(0)
    expect(frameAt(idle, idle.durationMs * 4 + per * 2)).toBe(2)
  })

  it('never indexes past the row into the animation below it', () => {
    // A resumed tab or a coarse timer hands this a large or ugly elapsed time;
    // the sheet has eight cells per row and this row uses six of them.
    const idle = CODEX_STATES.idle
    for (const elapsed of [idle.durationMs - 0.0001, 1e12, Number.MAX_SAFE_INTEGER]) {
      expect(frameAt(idle, elapsed)).toBeLessThanOrEqual(idle.frames - 1)
      expect(frameAt(idle, elapsed)).toBeGreaterThanOrEqual(0)
    }
  })

  it('holds the first frame for a single-frame or zero-length animation', () => {
    expect(frameAt({ row: 0, frames: 1, durationMs: 500 }, 12_345)).toBe(0)
    expect(frameAt({ row: 0, frames: 6, durationMs: 0 }, 12_345)).toBe(0)
  })
})

describe('locating a frame in the sheet', () => {
  it('reads across the row and down to the animation it belongs to', () => {
    expect(frameRect(CODEX_STATES.idle, 0)).toEqual({ x: 0, y: 0 })
    expect(frameRect(CODEX_STATES.idle, 3)).toEqual({ x: 3 * FRAME_WIDTH, y: 0 })
    expect(frameRect(CODEX_STATES.running, 2)).toEqual({
      x: 2 * FRAME_WIDTH,
      y: CODEX_STATES.running.row * FRAME_HEIGHT,
    })
  })

  it('keeps every row inside the sheet', () => {
    // 1536x1872 is the format; a row past it would draw transparent pixels and
    // look like a pet that vanished.
    for (const state of Object.values(CODEX_STATES)) {
      expect(state.row * FRAME_HEIGHT + FRAME_HEIGHT).toBeLessThanOrEqual(1872)
      expect(state.frames * FRAME_WIDTH).toBeLessThanOrEqual(1536)
    }
  })
})

describe('what the agent is doing, as an animation', () => {
  it('maps every reaction to a real row', () => {
    const rows = Object.values(CODEX_STATES)
    for (const reaction of ['idle', 'thinking', 'working', 'waiting', 'celebrating', 'failed'] as const) {
      expect(rows).toContainEqual(stateFor(reaction))
    }
  })

  it('gives thinking and working different animations, since they look different from outside', () => {
    expect(stateFor('thinking')).not.toEqual(stateFor('working'))
    expect(stateFor('idle')).toEqual(CODEX_STATES.idle)
  })
})
