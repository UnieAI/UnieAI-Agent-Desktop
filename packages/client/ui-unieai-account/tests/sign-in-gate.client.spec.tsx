// @vitest-environment jsdom
// The sign-in gate: which account states take the screen, which pass through,
// and — the part that is not a rendering question — when a signed-out window is
// SENT to the gate's sign-in page instead of being asked whether it would like
// to go. The distinction between `signed-out` and `unavailable` is the whole
// contract: a gate that stopped an offline desktop would be a locked door with
// no key, and one that redirected it would be a locked door that also throws
// away the key.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { UnieAiAccountState } from '../src/account-contract.ts'
import { SignInGate } from '../src/client/SignInGate.tsx'

beforeEach(() => { sessionStorage.clear() })
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/** The gate with one standing account state. */
function mount(state: UnieAiAccountState, signIn = vi.fn()) {
  const props = {
    t: (key: string) => key,
    useAccount: (select: (s: UnieAiAccountState) => unknown) => select(state),
    signIn,
  } as unknown as Parameters<typeof SignInGate>[0]
  return { view: render(<SignInGate {...props} />), signIn }
}

describe('what takes the screen', () => {
  it('sends a signed-out window to the sign-in page instead of asking it to go', () => {
    const { view, signIn } = mount({ status: 'signed-out' })
    expect(signIn).toHaveBeenCalledTimes(1)
    // A veil, not a card: the shell behind can answer nothing, and the copy
    // that used to live here was a page asking to show the next page.
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
    expect(view.container.firstChild).toBeTruthy()
    expect(screen.queryByText('gate.title')).toBeNull()
  })

  it('lets an unavailable one through, and does not send it anywhere', () => {
    // The host could not reach the product at all. The local agent does not
    // need it, and a sign-in page nobody can complete is a locked door.
    const { view, signIn } = mount({ status: 'unavailable' })
    expect(view.container.firstChild).toBeNull()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('lets a signed-in one through', () => {
    const { view, signIn } = mount({ status: 'signed-in' } as unknown as UnieAiAccountState)
    expect(view.container.firstChild).toBeNull()
    expect(signIn).not.toHaveBeenCalled()
  })
})

describe('when the send does not land', () => {
  it('offers the card to a tab that already went once, rather than bouncing it back out', () => {
    // What a person who came back from the sign-in page without finishing
    // meets. Sending them again would be a window they cannot stay in.
    mount({ status: 'signed-out' })
    cleanup()
    const { signIn } = mount({ status: 'signed-out' })
    expect(signIn).not.toHaveBeenCalled()
    expect(screen.getByText('gate.title')).toBeTruthy()
  })

  it('offers the card when nothing happens, because signIn reaches nothing without a gateway', () => {
    vi.useFakeTimers()
    mount({ status: 'signed-out' })
    expect(screen.queryByText('gate.title')).toBeNull()
    act(() => { vi.advanceTimersByTime(1500) })
    expect(screen.getByText('gate.title')).toBeTruthy()
  })

  it('starts the sign-in the sidebar row starts, not a second flow', () => {
    mount({ status: 'signed-out' })
    cleanup()
    const { signIn } = mount({ status: 'signed-out' })
    fireEvent.click(screen.getByRole('button', { name: 'gate.action' }))
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it('forgets the trip once there is an account, so a later sign-out is sent again', () => {
    mount({ status: 'signed-out' })
    cleanup()
    // Signing in clears the mark...
    mount({ status: 'signed-in' } as unknown as UnieAiAccountState)
    cleanup()
    // ...so signing out later leaves the same way the first time did.
    const { signIn } = mount({ status: 'signed-out' })
    expect(signIn).toHaveBeenCalledTimes(1)
  })
})
