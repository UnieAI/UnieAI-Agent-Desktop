/**
 * The skill catalogue view: how it groups, and what it keeps when a read fails.
 */
import { describe, expect, it } from 'vitest'

import type { SkillCatalogEntry } from '@unieai/uad-api-remotes/client'

import { createSkillsView, groupSkills, INITIAL_SKILLS_STATE } from '../src/client/skills-view.ts'

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
