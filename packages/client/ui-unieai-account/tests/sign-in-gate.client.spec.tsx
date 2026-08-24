// @vitest-environment jsdom
// The sign-in gate: which account states take the screen, and which pass
// through. The distinction is the whole contract — a gate that stopped an
// offline desktop would be a locked door with no key.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { UnieAiAccountState } from '../src/account-contract.ts'
import { SignInGate } from '../src/client/SignInGate.tsx'

afterEach(cleanup)

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
  it('stops a signed-out window, because nothing it types can be answered', () => {
    const { view } = mount({ status: 'signed-out' })
    expect(view.container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(screen.getByText('gate.title')).toBeTruthy()
  })

  it('lets an unavailable one through', () => {
    // The host could not reach the product at all. The local agent does not
    // need it, and a sign-in page nobody can complete is a locked door.
    const { view } = mount({ status: 'unavailable' })
    expect(view.container.firstChild).toBeNull()
  })

  it('lets a signed-in one through', () => {
    const { view } = mount({ status: 'signed-in' } as unknown as UnieAiAccountState)
    expect(view.container.firstChild).toBeNull()
  })

  it('starts the sign-in the sidebar row starts, not a second flow', () => {
    const signIn = vi.fn()
    mount({ status: 'signed-out' }, signIn)
    fireEvent.click(screen.getByRole('button', { name: 'gate.action' }))
    expect(signIn).toHaveBeenCalledTimes(1)
  })
})
