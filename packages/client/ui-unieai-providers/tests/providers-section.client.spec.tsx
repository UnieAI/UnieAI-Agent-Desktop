// @vitest-environment jsdom
/**
 * The API Provider section and its Add card as the user meets them.
 *
 * The postures that matter are the ones the web product's own page cannot be
 * in — no session, an unreadable host — plus the one that carries the design:
 * a platform-managed row opens a card offering ONLY what the product will
 * accept for it, so the reader learns the rule before typing rather than from
 * a refusal afterwards.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@unieai/uad-client-runtime/client'
import { bindSnapshotSelector, makeTranslate } from '@unieai/uad-client-test-runtime'
import { zh as commonZh } from '@unieai/uad-client-locale/src/locales/zh.ts'
import { ProvidersSection } from '../src/client/ProvidersSection.tsx'
import type { ProvidersSectionComponentProps } from '../src/client/ProvidersSection.tsx'
import type {
  ProviderDraft, ProviderOutcome, ProviderPatch, ProviderRow, ProvidersState,
} from '../src/client/provider-source.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as ProvidersSectionComponentProps['t']

const BYO: ProviderRow = {
  id: 'p_1',
  displayName: 'Acme',
  prefix: 'ACME',
  apiUrl: 'https://gateway.acme.example/v1',
  enabled: true,
  managed: false,
  models: ['acme-large', 'acme-small', 'acme-vision', 'acme-code'],
  selectedModels: ['acme-large', 'acme-small'],
}

const MANAGED: ProviderRow = {
  ...BYO,
  id: 'p_2',
  displayName: '',
  prefix: 'STU1',
  apiUrl: '',
  enabled: false,
  managed: true,
}

/** Every gesture the section can perform, stubbed and recorded. */
interface Gestures {
  create?: (draft: ProviderDraft) => Promise<ProviderOutcome>
  update?: (id: string, patch: ProviderPatch) => Promise<ProviderOutcome>
  remove?: (id: string) => Promise<ProviderOutcome>
}

const okCreate = async (_draft: ProviderDraft): Promise<ProviderOutcome> => ({ ok: true as const })
const okUpdate = async (_id: string, _patch: ProviderPatch): Promise<ProviderOutcome> =>
  ({ ok: true as const })
const okRemove = async (_id: string): Promise<ProviderOutcome> => ({ ok: true as const })

function setup(state: ProvidersState, gestures: Gestures = {}) {
  const store = createSnapshotStore<ProvidersState>(state)
  const refresh = vi.fn()
  const submit = vi.fn(gestures.create ?? okCreate)
  const save = vi.fn(gestures.update ?? okUpdate)
  const drop = vi.fn(gestures.remove ?? okRemove)
  const props = {
    t,
    useProviders: bindSnapshotSelector(store),
    refresh,
    create: submit,
    update: save,
    remove: drop,
  } as unknown as ProvidersSectionComponentProps
  render(<ProvidersSection {...props} />)
  return { refresh, submit, save, drop }
}

/** Open the edit card on the only row on screen. */
function openEdit(): void {
  fireEvent.click(screen.getByRole('button', { name: zh['edit'] }))
}

/** Fill the Add card, which opens behind the Add Provider button. */
function fillForm(values: { name?: string; prefix?: string; url?: string; key?: string }): void {
  fireEvent.click(screen.getByRole('button', { name: zh['add'] }))
  const set = (label: string, value: string | undefined): void => {
    if (value === undefined) return
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  set(zh['form.name'], values.name)
  set(zh['form.prefix'], values.prefix)
  set(zh['form.url'], values.url)
  set(zh['form.key'], values.key)
}

describe('API Provider section, before a list exists', () => {
  it('says it is still reading rather than showing an empty account', () => {
    setup({ status: 'loading' })
    expect(screen.getByText(zh['loading'])).toBeTruthy()
    expect(screen.queryByText(zh['empty'])).toBeNull()
  })

  it('explains a signed-out desktop instead of offering a dead Add button', () => {
    setup({ status: 'signed-out' })
    expect(screen.getByText(zh['signedOut'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: zh['add'] })).toBeNull()
  })

  it('offers a retry, not a blank list, when the host will not answer', () => {
    const bench = setup({ status: 'failed' })
    expect(screen.getByText(zh['unreadable'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['retry'] }))
    expect(bench.refresh).toHaveBeenCalledTimes(1)
  })
})

describe('API Provider section, with the account list', () => {
  it('prints the reference page\'s own two lines for an account with none', () => {
    setup({ status: 'ready', providers: [] })
    expect(screen.getByText(zh['empty'])).toBeTruthy()
    expect(screen.getByText(zh['emptyHint'])).toBeTruthy()
  })

  it('shows what each provider is called, addressed as, and serving', () => {
    setup({ status: 'ready', providers: [BYO] })
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('ACME')).toBeTruthy()
    expect(screen.getByText('https://gateway.acme.example/v1')).toBeTruthy()
    expect(screen.getByText('已选 2/4 个模型')).toBeTruthy()
  })

  it('names the absences instead of leaving a row half blank', () => {
    setup({ status: 'ready', providers: [MANAGED] })
    expect(screen.getByText(zh['unnamed'])).toBeTruthy()
    expect(screen.getByText(zh['urlUnset'])).toBeTruthy()
    expect(screen.getByText(zh['disabled'])).toBeTruthy()
  })

  it('marks a platform-managed row', () => {
    setup({ status: 'ready', providers: [MANAGED] })
    expect(screen.getByText(zh['managed'])).toBeTruthy()
    expect(screen.getByText(zh['managedHint'])).toBeTruthy()
  })
})

describe('editing a platform-managed row', () => {
  it('offers only what the product will accept, and says why', () => {
    setup({ status: 'ready', providers: [MANAGED] })
    openEdit()

    expect(screen.getByText(zh['managedEditable'])).toBeTruthy()
    // The credential, the endpoint and the routing prefix belong to the Studio
    // binding. Drawing fields for them would earn a 409 after the typing.
    expect(screen.queryByLabelText(zh['form.name'])).toBeNull()
    expect(screen.queryByLabelText(zh['form.prefix'])).toBeNull()
    expect(screen.queryByLabelText(zh['form.url'])).toBeNull()
    expect(screen.queryByLabelText(zh['form.key'])).toBeNull()
    // The two the product does accept are here.
    expect(screen.getByLabelText(zh['form.enabled'])).toBeTruthy()
    expect(screen.getByLabelText('acme-large')).toBeTruthy()
  })

  it('never offers to delete one: it goes away by unbinding Studio', () => {
    setup({ status: 'ready', providers: [MANAGED] })
    openEdit()

    expect(screen.queryByRole('button', { name: zh['delete'] })).toBeNull()
    expect(screen.getByText(zh['managedNoDelete'])).toBeTruthy()
  })

  it('submits the two accepted fields and nothing else', async () => {
    const bench = setup({ status: 'ready', providers: [MANAGED] })
    openEdit()
    fireEvent.click(screen.getByLabelText(zh['form.enabled']))
    fireEvent.click(screen.getByLabelText('acme-vision'))
    fireEvent.click(screen.getByRole('button', { name: zh['save'] }))

    await waitFor(() => { expect(bench.save).toHaveBeenCalledTimes(1) })
    expect(bench.save).toHaveBeenCalledWith('p_2', {
      enabled: true,
      selectedModels: ['acme-large', 'acme-small', 'acme-vision'],
    })
  })

  it('still shows the refusal when the product rejects the save anyway', async () => {
    setup(
      { status: 'ready', providers: [MANAGED] },
      { update: async () => ({ ok: false as const, reason: 'error.managed' as const }) },
    )
    openEdit()
    fireEvent.click(screen.getByRole('button', { name: zh['save'] }))

    await waitFor(() => { expect(screen.getByText(zh['error.managed'])).toBeTruthy() })
  })
})

describe('editing a BYO row', () => {
  it('opens on the stored values, with the credential field blank', () => {
    setup({ status: 'ready', providers: [BYO] })
    openEdit()

    expect(screen.getByLabelText<HTMLInputElement>(zh['form.name']).value).toBe('Acme')
    expect(screen.getByLabelText<HTMLInputElement>(zh['form.prefix']).value).toBe('ACME')
    expect(screen.getByLabelText<HTMLInputElement>(zh['form.url']).value)
      .toBe('https://gateway.acme.example/v1')
    // Nothing can read a stored credential back, so the field starts empty and
    // says what leaving it that way means.
    expect(screen.getByLabelText<HTMLInputElement>(zh['form.key']).value).toBe('')
    expect(screen.getByPlaceholderText(zh['form.keyKeep'])).toBeTruthy()
  })

  it('omits apiKey entirely when the key was not retyped', async () => {
    const bench = setup({ status: 'ready', providers: [BYO] })
    openEdit()
    fireEvent.change(screen.getByLabelText(zh['form.name']), { target: { value: 'Acme Two' } })
    fireEvent.click(screen.getByRole('button', { name: zh['save'] }))

    await waitFor(() => { expect(bench.save).toHaveBeenCalledTimes(1) })
    const patch = bench.save.mock.calls[0]?.[1] as ProviderPatch
    expect('apiKey' in patch).toBe(false)
    expect(patch.displayName).toBe('Acme Two')
  })

  it('sends the credential only when one was typed', async () => {
    const bench = setup({ status: 'ready', providers: [BYO] })
    openEdit()
    fireEvent.change(screen.getByLabelText(zh['form.key']), { target: { value: ' sk-new ' } })
    fireEvent.click(screen.getByRole('button', { name: zh['save'] }))

    await waitFor(() => { expect(bench.save).toHaveBeenCalledTimes(1) })
    expect((bench.save.mock.calls[0]?.[1] as ProviderPatch).apiKey).toBe('sk-new')
  })

  it('refuses a prefix it can judge itself, without spending a request', () => {
    const bench = setup({ status: 'ready', providers: [BYO] })
    openEdit()
    fireEvent.change(screen.getByLabelText(zh['form.prefix']), { target: { value: 'AB' } })
    fireEvent.click(screen.getByRole('button', { name: zh['save'] }))

    expect(screen.getByText(zh['error.prefixFormat'])).toBeTruthy()
    expect(bench.save).not.toHaveBeenCalled()
  })

  it('selects and clears the whole catalogue in one gesture', async () => {
    const bench = setup({ status: 'ready', providers: [BYO] })
    openEdit()
    fireEvent.click(screen.getByRole('button', { name: zh['form.clearAll'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['form.selectAll'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['save'] }))

    await waitFor(() => { expect(bench.save).toHaveBeenCalledTimes(1) })
    expect((bench.save.mock.calls[0]?.[1] as ProviderPatch).selectedModels).toEqual(BYO.models)
  })

  it('says a provider was saved, and closes the card', async () => {
    setup({ status: 'ready', providers: [BYO] })
    openEdit()
    fireEvent.click(screen.getByRole('button', { name: zh['save'] }))

    await waitFor(() => { expect(screen.getByText(zh['saved'])).toBeTruthy() })
    expect(screen.queryByLabelText(zh['form.name'])).toBeNull()
  })

  it('recovers from a rejected save rather than staying busy forever', async () => {
    setup({ status: 'ready', providers: [BYO] }, { update: () => Promise.reject(new Error('offline')) })
    openEdit()
    fireEvent.click(screen.getByRole('button', { name: zh['save'] }))

    await waitFor(() => { expect(screen.getByText(zh['error.failed'])).toBeTruthy() })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh['save'] }).disabled).toBe(false)
  })

  it('closes without saving when the card is cancelled', () => {
    const bench = setup({ status: 'ready', providers: [BYO] })
    openEdit()
    fireEvent.click(screen.getByRole('button', { name: zh['form.cancel'] }))

    expect(bench.save).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(zh['form.name'])).toBeNull()
  })
})

describe('deleting a provider', () => {
  it('asks first, and says the models go with it', () => {
    const bench = setup({ status: 'ready', providers: [BYO] })
    openEdit()
    fireEvent.click(screen.getByRole('button', { name: zh['delete'] }))

    expect(screen.getByText('确定删除 Provider「Acme」？')).toBeTruthy()
    expect(screen.getByText(zh['deleteWarning'])).toBeTruthy()
    expect(bench.drop).not.toHaveBeenCalled()
  })

  it('removes the provider once the question is answered', async () => {
    const bench = setup({ status: 'ready', providers: [BYO] })
    openEdit()
    fireEvent.click(screen.getByRole('button', { name: zh['delete'] }))
    // The confirmation's own button, not the one that opened it.
    fireEvent.click(screen.getAllByRole('button', { name: zh['delete'] })[0]!)

    await waitFor(() => { expect(bench.drop).toHaveBeenCalledWith('p_1') })
    await waitFor(() => { expect(screen.getByText(zh['deleted'])).toBeTruthy() })
  })

  it('backs out of the question without removing anything', () => {
    const bench = setup({ status: 'ready', providers: [BYO] })
    openEdit()
    fireEvent.click(screen.getByRole('button', { name: zh['delete'] }))
    fireEvent.click(screen.getByRole('button', { name: zh['form.cancel'] }))

    expect(bench.drop).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: zh['save'] })).toBeTruthy()
  })

  it("shows the product's refusal and leaves the row in place", async () => {
    setup(
      { status: 'ready', providers: [BYO] },
      { remove: async () => ({ ok: false as const, reason: 'error.deleteFailed' as const }) },
    )
    openEdit()
    fireEvent.click(screen.getByRole('button', { name: zh['delete'] }))
    fireEvent.click(screen.getAllByRole('button', { name: zh['delete'] })[0]!)

    await waitFor(() => { expect(screen.getByText(zh['error.deleteFailed'])).toBeTruthy() })
    expect(screen.queryByText(zh['deleted'])).toBeNull()
  })
})

describe('adding a provider', () => {
  it('submits the four fields the web product asks for, prefix upper-cased', async () => {
    const bench = setup({ status: 'ready', providers: [] })
    fillForm({ name: ' Acme ', prefix: 'oai1', url: ' https://x.example ', key: ' sk-typed ' })
    fireEvent.click(screen.getByRole('button', { name: zh['form.submit'] }))

    await waitFor(() => { expect(bench.submit).toHaveBeenCalledTimes(1) })
    expect(bench.submit).toHaveBeenCalledWith({
      displayName: 'Acme',
      prefix: 'OAI1',
      apiUrl: 'https://x.example',
      apiKey: 'sk-typed',
    })
  })

  it('says a provider was created, and closes the card', async () => {
    setup({ status: 'ready', providers: [] })
    fillForm({ name: 'Acme', prefix: 'OAI1', url: 'https://x.example', key: 'sk' })
    fireEvent.click(screen.getByRole('button', { name: zh['form.submit'] }))

    await waitFor(() => { expect(screen.getByText(zh['created'])).toBeTruthy() })
    expect(screen.queryByLabelText(zh['form.key'])).toBeNull()
  })

  it('refuses a blank field itself, without spending a request', () => {
    const bench = setup({ status: 'ready', providers: [] })
    fillForm({})
    fireEvent.click(screen.getByRole('button', { name: zh['form.submit'] }))
    expect(screen.getByText(zh['error.name'])).toBeTruthy()

    fireEvent.change(screen.getByLabelText(zh['form.name']), { target: { value: 'Acme' } })
    fireEvent.click(screen.getByRole('button', { name: zh['form.submit'] }))
    expect(screen.getByText(zh['error.prefixRequired'])).toBeTruthy()

    fireEvent.change(screen.getByLabelText(zh['form.prefix']), { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: zh['form.submit'] }))
    expect(screen.getByText(zh['error.prefixFormat'])).toBeTruthy()

    fireEvent.change(screen.getByLabelText(zh['form.prefix']), { target: { value: 'OAI1' } })
    fireEvent.click(screen.getByRole('button', { name: zh['form.submit'] }))
    expect(screen.getByText(zh['error.fields'])).toBeTruthy()

    expect(bench.submit).not.toHaveBeenCalled()
  })

  it("shows the product's own refusal and keeps the draft on screen", async () => {
    setup(
      { status: 'ready', providers: [] },
      { create: async () => ({ ok: false as const, reason: 'error.prefixExists' as const }) },
    )
    fillForm({ name: 'Acme', prefix: 'OAI1', url: 'https://x.example', key: 'sk' })
    fireEvent.click(screen.getByRole('button', { name: zh['form.submit'] }))

    await waitFor(() => { expect(screen.getByText(zh['error.prefixExists'])).toBeTruthy() })
    expect(screen.getByLabelText<HTMLInputElement>(zh['form.name']).value).toBe('Acme')
    expect(screen.queryByText(zh['created'])).toBeNull()
  })

  it('recovers from a rejected submit rather than staying busy forever', async () => {
    setup({ status: 'ready', providers: [] }, { create: () => Promise.reject(new Error('offline')) })
    fillForm({ name: 'Acme', prefix: 'OAI1', url: 'https://x.example', key: 'sk' })
    fireEvent.click(screen.getByRole('button', { name: zh['form.submit'] }))

    await waitFor(() => { expect(screen.getByText(zh['error.failed'])).toBeTruthy() })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh['form.submit'] }).disabled)
      .toBe(false)
  })

  it('closes without submitting when the card is cancelled', () => {
    const bench = setup({ status: 'ready', providers: [] })
    fillForm({ name: 'Acme' })
    fireEvent.click(screen.getByRole('button', { name: zh['form.cancel'] }))

    expect(bench.submit).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(zh['form.name'])).toBeNull()
    expect(screen.queryByText(zh['created'])).toBeNull()
  })
})
