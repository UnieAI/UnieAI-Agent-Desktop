// @vitest-environment jsdom
/**
 * The vision-route chooser: what it offers, and what one choice writes.
 *
 * The write is the contract this card owns — `tool-image-inspect` reads that
 * namespace live, so a wrong path or a half-written route is the difference
 * between the tool appearing and the person concluding the setting does
 * nothing.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VisionModelCard } from '../src/client/VisionModelCard.tsx'
import { VISION_NS } from '../src/client/store.ts'
import type { VisionModelOption } from '../src/client/store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en): string => en[key]

const OPTIONS: VisionModelOption[] = [
  { provider: 'unieai', providerName: 'UnieAI', model: 'abcd-gpt-4o', modelName: 'GPT-4o' },
  { provider: 'local-vllm', providerName: 'Local vLLM', model: 'qwen2-vl', modelName: 'Qwen2 VL' },
]

/**
 * Render the card over a scripted settings face.
 * @param options - what the catalog offered.
 * @param current - the route already configured, if any.
 * @returns the mutate spy and the saved-callback spy.
 */
function mount(options: VisionModelOption[], current?: { provider: string; model: string }) {
  const mutate = vi.fn(() => Promise.resolve({ rpcId: 'r', result: { ok: true, value: { value: {} } } } as never))
  const onSaved = vi.fn()
  render(
    <VisionModelCard
      options={options}
      {...current === undefined ? { current: undefined } : { current }}
      writable
      api={{ settings: { mutate } } as never}
      t={t}
      onSaved={onSaved}
    />,
  )
  return { mutate, onSaved }
}

describe('choosing the model that looks at pictures', () => {
  it('offers every image-capable model across routes, labelled by provider', () => {
    mount(OPTIONS)
    const select = screen.getByLabelText(en.visionTitle) as HTMLSelectElement
    expect([...select.options].map(option => option.textContent)).toEqual([
      en.visionNone,
      'UnieAI · GPT-4o',
      'Local vLLM · Qwen2 VL',
    ])
  })

  it('writes both halves of the route into the tool own namespace', async () => {
    const { mutate, onSaved } = mount(OPTIONS)
    fireEvent.change(screen.getByLabelText(en.visionTitle), { target: { value: '1' } })
    await waitFor(() => { expect(onSaved).toHaveBeenCalledOnce() })
    expect(mutate).toHaveBeenCalledWith({
      ns: VISION_NS,
      ops: [
        { op: 'set', path: ['provider'], value: 'local-vllm' },
        { op: 'set', path: ['model'], value: 'qwen2-vl' },
      ],
    })
    expect(screen.getByRole('status').textContent).toBe(en.visionSaved)
  })

  it('clears both halves when the route is set to none, because half a route is not one', async () => {
    const { mutate } = mount(OPTIONS, { provider: 'unieai', model: 'abcd-gpt-4o' })
    expect(screen.getByLabelText<HTMLSelectElement>(en.visionTitle).value).toBe('0')
    fireEvent.change(screen.getByLabelText(en.visionTitle), { target: { value: '' } })
    await waitFor(() => { expect(mutate).toHaveBeenCalledOnce() })
    expect(mutate).toHaveBeenCalledWith({
      ns: VISION_NS,
      ops: [{ op: 'unset', path: ['provider'] }, { op: 'unset', path: ['model'] }],
    })
  })

  it('says so plainly when no configured provider offers a model that can see', () => {
    mount([])
    expect(screen.queryByLabelText(en.visionTitle)).toBeNull()
    expect(screen.getByText(en.visionEmpty)).toBeTruthy()
  })

  it('reports a refused write instead of showing a save that did not happen', async () => {
    const mutate = vi.fn(() => Promise.resolve({
      rpcId: 'r',
      result: { ok: false, error: { code: 'settings-error', message: 'read-only settings' } },
    } as never))
    const onSaved = vi.fn()
    render(
      <VisionModelCard
        options={OPTIONS}
        current={undefined}
        writable
        api={{ settings: { mutate } } as never}
        t={t}
        onSaved={onSaved}
      />,
    )
    fireEvent.change(screen.getByLabelText(en.visionTitle), { target: { value: '0' } })
    await waitFor(() => { expect(screen.getByText(/read-only settings/)).toBeTruthy() })
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
