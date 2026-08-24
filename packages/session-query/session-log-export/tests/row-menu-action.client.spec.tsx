// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@unieai/uad-client-runtime/client'
import { SessionLogDownloadRowAction } from '../src/client/RowMenuAction.tsx'
import type { SessionLogDownloadRowActionProps } from '../src/client/RowMenuAction.tsx'
import { en } from '../src/client/locales.ts'

const ROW = 'session-row' as SessionId

function bench() {
  const request = vi.fn(async () => {})
  const closeMenu = vi.fn()
  const props = {
    sessionId: ROW,
    closeMenu,
    request,
    t: (key: keyof typeof en): string => en[key],
  } as unknown as SessionLogDownloadRowActionProps
  render(<SessionLogDownloadRowAction {...props} />)
  return { request, closeMenu }
}

afterEach(cleanup)

describe('Session export sidebar row menu action', () => {
  it('downloads the row Session and closes the menu it sat in', async () => {
    const b = bench()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download session log' }))
    expect(b.closeMenu).toHaveBeenCalledOnce()
    await waitFor(() => { expect(b.request).toHaveBeenCalledWith(ROW) })
    expect(b.request).toHaveBeenCalledOnce()
  })
})
