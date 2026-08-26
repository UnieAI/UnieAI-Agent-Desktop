/**
 * The skills this app ships, through the real discovery provider.
 *
 * A skill that parses but is never discovered is indistinguishable from one
 * that does not exist, and the two ways it can fail are silent: frontmatter
 * the parser rejects, and a root nothing points at. Both are checked here
 * against the actual `config/skills` directory rather than a fixture.
 */
import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@unieai/cordis'
import SkillRegistry from '@unieai/uad-skill'
import * as SkillFileSystem from '@unieai/uad-skill-filesystem'

const SHIPPED = fileURLToPath(new URL('../config/skills/', import.meta.url))

/** Every skill name this app is expected to carry. */
const EXPECTED = ['brainstorming', 'find-skill', 'skill-creator']

describe('skills shipped with the app', () => {
  it('are discovered from the bundled root the launcher points at', async () => {
    // Isolated homes: the point is what the SHIPPED root contributes, not what
    // the machine running the test happens to carry.
    const home = await mkdtemp(join(tmpdir(), 'rabi-shipped-skills-'))
    const previous = {
      dshHome: process.env['DSH_HOME'],
      agentsHome: process.env['DSH_AGENTS_HOME'],
      bundled: process.env['DSH_BUNDLED_SKILL_DIR'],
    }
    const ctx = new Context()
    try {
      process.env['DSH_HOME'] = join(home, '.dsh')
      process.env['DSH_AGENTS_HOME'] = join(home, '.agents')
      process.env['DSH_BUNDLED_SKILL_DIR'] = SHIPPED
      await ctx.plugin(SkillRegistry)
      await ctx.plugin(SkillFileSystem, { watch: false })

      const found = (await ctx.skills.list()).map(skill => skill.name).sort()
      expect(found).toEqual(EXPECTED)
    } finally {
      await ctx.fiber.dispose()
      process.env['DSH_HOME'] = previous.dshHome
      process.env['DSH_AGENTS_HOME'] = previous.agentsHome
      process.env['DSH_BUNDLED_SKILL_DIR'] = previous.bundled
      await rm(home, { recursive: true, force: true })
    }
  })

  it('describe themselves by trigger, since a description is all a model reads before loading one', async () => {
    const home = await mkdtemp(join(tmpdir(), 'rabi-shipped-skills-'))
    const previous = process.env['DSH_BUNDLED_SKILL_DIR']
    const ctx = new Context()
    try {
      process.env['DSH_HOME'] = join(home, '.dsh')
      process.env['DSH_AGENTS_HOME'] = join(home, '.agents')
      process.env['DSH_BUNDLED_SKILL_DIR'] = SHIPPED
      await ctx.plugin(SkillRegistry)
      await ctx.plugin(SkillFileSystem, { watch: false })

      for (const skill of await ctx.skills.list()) {
        // A description that opens on the SITUATION finds itself in a
        // catalog; one that summarises the skill's contents does not. "when"
        // or "before" — the word is not the rule, leading with the trigger is.
        expect(skill.description, skill.name).toMatch(/^Use (?:when|before) /)
        expect(skill.description.length, skill.name).toBeGreaterThan(60)
      }
    } finally {
      await ctx.fiber.dispose()
      process.env['DSH_BUNDLED_SKILL_DIR'] = previous
      await rm(home, { recursive: true, force: true })
    }
  })
})
