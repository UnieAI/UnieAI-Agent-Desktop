/**
 * The skill catalogue this build serves, as the destination reads it.
 *
 * Fetched when the page opens rather than watched. Skills are files a person
 * edits outside Rabi — with their own editor, or by asking the agent to
 * write one — so the honest moment to read them is when someone comes to
 * look, and again when they ask.
 */

import type { SkillCatalogEntry } from '@unieai/uad-api-remotes/client'

/** What the destination renders from. */
export interface SkillsState {
  /** Every skill the deployment serves, sorted by the host. */
  skills: SkillCatalogEntry[]
  /** Whether a read is in flight. */
  busy: boolean
  /** Whether a read has ever completed; an empty catalogue is not the same as an unread one. */
  loaded: boolean
  /** What went wrong, in the host's own words. */
  error: string
}

/** A snapshot store the destination binds to. */
export interface SkillsView {
  getSnapshot(): SkillsState
  subscribe(listener: () => void): () => void
}

/** What the view needs from the host. */
export interface SkillsRoutes {
  /** Read the catalogue. */
  catalog(): Promise<{ ok: true; skills: SkillCatalogEntry[] } | { ok: false; message: string }>
}

/** The state the destination starts from, before anything has been read. */
export const INITIAL_SKILLS_STATE: SkillsState = { skills: [], busy: false, loaded: false, error: '' }

/**
 * Group the catalogue the way a person thinks about it.
 *
 * Where a skill lives decides what someone can do with it: their own are
 * theirs to edit, a project's belong to that repository, and the ones this
 * build ships are not theirs at all. The order puts what they can act on
 * first.
 * @param skills - the catalogue.
 * @returns groups in display order, each non-empty.
 */
export function groupSkills(skills: readonly SkillCatalogEntry[]): { key: string; skills: SkillCatalogEntry[] }[] {
  const groups = new Map<string, SkillCatalogEntry[]>()
  for (const skill of skills) {
    const key = skill.source.startsWith('user') ? 'personal'
      : skill.source.startsWith('project') ? 'project'
        : skill.source === 'bundled' ? 'bundled' : 'other'
    const bucket = groups.get(key)
    if (bucket === undefined) groups.set(key, [skill])
    else bucket.push(skill)
  }
  return ['personal', 'project', 'bundled', 'other']
    .filter(key => (groups.get(key)?.length ?? 0) > 0)
    .map(key => ({ key, skills: groups.get(key) ?? [] }))
}

/**
 * Build the view.
 * @param routes - the host calls this view makes.
 * @returns a store plus the one gesture the destination offers.
 */
export function createSkillsView(routes: SkillsRoutes): SkillsView & { refresh(): Promise<void> } {
  let state = INITIAL_SKILLS_STATE
  const listeners = new Set<() => void>()
  const publish = (next: Partial<SkillsState>): void => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh: async () => {
      publish({ busy: true, error: '' })
      const answer = await routes.catalog()
      // A failed read keeps the catalogue already on screen: it is still
      // what the deployment served a moment ago.
      if (answer.ok) publish({ skills: answer.skills, busy: false, loaded: true, error: '' })
      else publish({ busy: false, error: answer.message })
    },
  }
}
