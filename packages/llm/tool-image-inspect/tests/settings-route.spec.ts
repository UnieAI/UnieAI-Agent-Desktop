/**
 * The vision route as SETTINGS, over a real settings file.
 *
 * A person picking a vision model in the UI writes this namespace, so the
 * question these tests answer is whether the tool follows without a restart —
 * a chosen route that only took effect next launch would read as "the setting
 * did nothing".
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@unieai/cordis'
import FileSettingsProvider from '@unieai/uad-settings-file'
import { settingsNamespace } from '@unieai/uad-settings'
import SystemPrompt from '@unieai/uad-system-prompt'
import ToolRuntime from '@unieai/uad-tools'
import ImageInspect, { Config } from '../src/index.ts'

const NS = settingsNamespace('tool-image-inspect')
const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/**
 * Boot the tool over a real settings file.
 * @param config - the composition entry, i.e. what `cordis.yml` said.
 * @returns the context and the tool names currently registered.
 */
async function boot(config: unknown = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-vision-route-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const ctx = new Context()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(FileSettingsProvider, { path: join(dir, 'settings.yaml'), watch: false })
  ctx.provide('attachments', {} as never)
  ctx.provide('llm', { resolveModelInfo: () => Promise.resolve({ inputModalities: ['text', 'image'] }) } as never)
  await ctx.plugin(ImageInspect, Config(config as never))
  return { ctx, names: () => ctx.tools.schemas().map(schema => schema.name) }
}

describe('the vision route comes from settings', () => {
  it('registers nothing until a route is named, then follows the choice live', async () => {
    const { ctx, names } = await boot()
    expect(names()).toEqual([])

    await ctx.settings.mutate(NS, [
      { op: 'set', path: ['provider'], value: 'vision' },
      { op: 'set', path: ['model'], value: 'vlm-1' },
    ])
    expect(names()).toEqual(['image_inspect'])
  })

  it('withdraws the tool when the route is cleared, prompt section included', async () => {
    const { ctx, names } = await boot({ provider: 'vision', model: 'vlm-1' })
    expect(names()).toEqual(['image_inspect'])
    const prompt = async (): Promise<string[]> => (await ctx.systemPrompt.assemble())
      .sections.map(section => section.name)
    expect(await prompt()).toContain('tool:image_inspect')

    await ctx.settings.mutate(NS, [{ op: 'set', path: ['model'], value: '' }])
    expect(names()).toEqual([])
    // The prompt section describes the tool; leaving it behind would tell the
    // model to call something that is no longer registered.
    expect(await prompt()).not.toContain('tool:image_inspect')
  })

  it('keeps the composition entry as the default a settings document overrides', async () => {
    // What `cordis.yml` named still serves when the person never chose one.
    const { ctx, names } = await boot({ provider: 'vision', model: 'from-config' })
    expect(names()).toEqual(['image_inspect'])

    await ctx.settings.mutate(NS, [{ op: 'set', path: ['model'], value: 'from-settings' }])
    expect(names()).toEqual(['image_inspect'])
  })
})
