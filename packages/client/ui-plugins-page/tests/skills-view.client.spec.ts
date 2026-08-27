/**
 * The skill catalogue view: how it groups, and what it keeps when a read fails.
 */
import { describe, expect, it } from 'vitest'

import type { SkillCatalogEntry } from '@unieai/uad-api-remotes/client'

import { createSkillsView, groupSkills, INITIAL_SKILLS_STATE } from '../src/client/skills-view.ts'
import { createAccountSkillsSource } from '../src/client/account-skills-source.ts'

type Answer = { ok: true; skills: SkillCatalogEntry[] } | { ok: false; message: string }

const skill = (name: string, source: string): SkillCatalogEntry => ({
  name,
  source,
  description: `${name} does something`,
  path: `/skills/${name}/SKILL.md`,
  provider: 'filesystem',
  userInvocable: true,
  modelInvocable: true,
})

describe('groupSkills', () => {
  it('puts what a person can edit before what the build ships', () => {
    const groups = groupSkills([
      skill('shipped', 'bundled'),
      skill('mine', 'user'),
      skill('ours', 'project'),
    ])
    expect(groups.map(group => group.key)).toEqual(['personal', 'project', 'bundled'])
  })

  it('names an empty group nowhere', () => {
    expect(groupSkills([skill('shipped', 'bundled')]).map(group => group.key)).toEqual(['bundled'])
    expect(groupSkills([])).toEqual([])
  })

  it('reads a qualified origin as its family', () => {
    // The host spells where a skill was found; `user:/home/...` is still the
    // person's own, and a heading per directory would be a wall of paths.
    const groups = groupSkills([skill('a', 'user:/home/p/.dsh/skills'), skill('b', 'project:/repo/.dsh/skills')])
    expect(groups.map(group => group.key)).toEqual(['personal', 'project'])
  })

  it('shows an origin it does not recognize rather than dropping it', () => {
    expect(groupSkills([skill('x', 'plugin')]).map(group => group.key)).toEqual(['other'])
  })
})

describe('createSkillsView', () => {
  it('starts unread, which is not the same as empty', () => {
    const view = createSkillsView({ catalog: async () => ({ ok: true, skills: [] }) })
    expect(view.getSnapshot()).toEqual(INITIAL_SKILLS_STATE)
    expect(view.getSnapshot().loaded).toBe(false)
  })

  it('publishes the catalogue and wakes its listeners', async () => {
    let woken = 0
    const view = createSkillsView({ catalog: async () => ({ ok: true, skills: [skill('mine', 'user')] }) })
    view.subscribe(() => { woken += 1 })
    await view.refresh()
    expect(view.getSnapshot().skills.map(entry => entry.name)).toEqual(['mine'])
    expect(view.getSnapshot().loaded).toBe(true)
    expect(woken).toBeGreaterThanOrEqual(2)
  })

  it('keeps the catalogue on screen when a later read fails', async () => {
    let answer: Answer = { ok: true, skills: [skill('mine', 'user')] }
    const view = createSkillsView({ catalog: async (): Promise<Answer> => answer })
    await view.refresh()
    answer = { ok: false, message: 'the machine went away' }
    await view.refresh()
    // What was served a moment ago is still the best answer anyone has.
    expect(view.getSnapshot().skills.map(entry => entry.name)).toEqual(['mine'])
    expect(view.getSnapshot().error).toBe('the machine went away')
    expect(view.getSnapshot().busy).toBe(false)
  })

  it('clears the previous failure when a read starts', async () => {
    let answer: Answer = { ok: false, message: 'gone' }
    const view = createSkillsView({ catalog: async (): Promise<Answer> => answer })
    await view.refresh()
    expect(view.getSnapshot().error).toBe('gone')
    answer = { ok: true, skills: [] }
    await view.refresh()
    expect(view.getSnapshot().error).toBe('')
  })

  it('stops waking a listener that unsubscribed', async () => {
    let woken = 0
    const view = createSkillsView({ catalog: async () => ({ ok: true, skills: [] }) })
    const stop = view.subscribe(() => { woken += 1 })
    stop()
    await view.refresh()
    expect(woken).toBe(0)
  })
})

describe('the account skill source', () => {
  const answer = (status: number, body: unknown): Response =>
    ({ status, json: () => Promise.resolve(body) }) as Response

  it('reads a deployment older than the route as unsupported, not as a failure', async () => {
    // A build with no account gate cannot be helped by a retry, and the
    // section draws nothing for it.
    const source = createAccountSkillsSource({ request: () => Promise.resolve(answer(404, {})) }, {
      install: () => Promise.resolve({ ok: false as const, message: '' }),
    })
    await source.refresh()
    expect(source.getSnapshot().state.status).toBe('unsupported')
  })

  it('reads the gate signed-out envelope as signed out', async () => {
    const source = createAccountSkillsSource(
      { request: () => Promise.resolve(answer(200, { status: 'signed-out' })) },
      { install: () => Promise.resolve({ ok: false as const, message: '' }) },
    )
    await source.refresh()
    expect(source.getSnapshot().state.status).toBe('signed-out')
  })

  it('reads an account with no skills as an answer, not as a failure', async () => {
    const source = createAccountSkillsSource(
      { request: () => Promise.resolve(answer(200, { status: 'signed-in', skills: [] })) },
      { install: () => Promise.resolve({ ok: false as const, message: '' }) },
    )
    await source.refresh()
    expect(source.getSnapshot().state).toEqual({ status: 'ready', skills: [] })
  })

  it('drops a row it cannot act on, and a second row under one slug', async () => {
    const source = createAccountSkillsSource({
      request: () => Promise.resolve(answer(200, {
        status: 'signed-in',
        skills: [
          { slug: 'weekly', name: 'Weekly', description: 'a', origin: 'personal', attachments: [] },
          { slug: 'weekly', name: 'Weekly again', description: 'b', origin: 'personal' },
          { slug: '', name: 'nameless slug' },
          { name: 'no slug at all' },
          'not an object',
        ],
      })),
    }, { install: () => Promise.resolve({ ok: false as const, message: '' }) })
    await source.refresh()
    const state = source.getSnapshot().state
    expect(state.status === 'ready' && state.skills.map(skill => skill.name)).toEqual(['Weekly'])
  })

  it('builds a row field by field, so an unknown wire field cannot reach the page', async () => {
    const source = createAccountSkillsSource({
      request: () => Promise.resolve(answer(200, {
        status: 'signed-in',
        skills: [{ slug: 'weekly', name: 'Weekly', description: 'a', origin: 'personal', token: 'sk-secret' }],
      })),
    }, { install: () => Promise.resolve({ ok: false as const, message: '' }) })
    await source.refresh()
    expect(JSON.stringify(source.getSnapshot().state).includes('sk-secret')).toBe(false)
  })

  it('reports what a copy wrote, and refuses to run the same one twice at once', async () => {
    let calls = 0
    let release = (): void => {}
    const source = createAccountSkillsSource(
      { request: () => Promise.resolve(answer(200, { status: 'signed-in', skills: [] })) },
      {
        install: async (slug) => {
          calls += 1
          await new Promise<void>((resolve) => { release = resolve })
          return { ok: true as const, outcome: { name: slug, path: `/skills/${slug}/SKILL.md`, replaced: true } }
        },
      },
    )
    const first = source.copy('weekly')
    await source.copy('weekly')
    expect(source.getSnapshot().copying).toEqual(['weekly'])
    release()
    await first
    expect(calls).toBe(1)
    expect(source.getSnapshot().copied['weekly']?.replaced).toBe(true)
    expect(source.getSnapshot().copying).toEqual([])
  })

  it('keeps the host own words when a copy is refused', async () => {
    const source = createAccountSkillsSource(
      { request: () => Promise.resolve(answer(200, { status: 'signed-in', skills: [] })) },
      { install: () => Promise.resolve({ ok: false as const, message: 'your UnieAI account has no skill "gone"' }) },
    )
    await source.copy('gone')
    expect(source.getSnapshot().error).toBe('your UnieAI account has no skill "gone"')
    expect(source.getSnapshot().copying).toEqual([])
  })
})
