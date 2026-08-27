// @vitest-environment node
/**
 * The world this computer gets, built the way its providers need.
 *
 * The bug this pins: the router constructed each provider directly, which
 * skips the lifecycle that honours a declared injection. The sandboxed local
 * filesystem declares `sandboxPolicy`, so every read through the router was
 * refused with `cannot get property "sandboxPolicy" without inject` — and
 * the callers that read through `ctx.fs` swallow a failed read as an absent
 * file. Skill discovery reported an empty catalogue, in a build that shipped
 * three skills.
 *
 * Enforcement only happens for a context that declares injections, which is
 * why the router is mounted as a plugin here rather than constructed: a bare
 * `new Context()` would pass while the product failed.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import FileSettingsProvider from '@unieai/uad-settings-file'
import SandboxPolicyService from '@unieai/uad-sandbox-policy'
import Machines from '@unieai/uad-machines'
import { RoutedFileSystem } from '../src/index.ts'

/** A composition shaped like the product's: policy, machines, routed fs. */
async function composed(options: { sandbox: boolean; mode?: 'read-only' | 'workspace-write' }) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-local-world-'))
  const ctx = new Context()
  await ctx.plugin(FileSettingsProvider, { path: join(home, 'settings.yaml'), watch: false })
  if (options.sandbox) {
    await ctx.plugin(SandboxPolicyService, { mode: options.mode ?? 'workspace-write', workspaceRoot: home })
  }
  await ctx.plugin(Machines, {})
  await ctx.plugin(RoutedFileSystem, {})
  return { ctx, home }
}

describe('this computer, through the router', () => {
  it('reads a file in a composition that mounts a sandbox policy', async () => {
    const { ctx, home } = await composed({ sandbox: true })
    const path = join(home, 'note.txt')
    await writeFile(path, 'written before the read\n')

    const target = await ctx.fs.resolve(path)
    expect((await ctx.fs.stat(target))?.type).toBe('file')
    expect(await ctx.fs.readText(target)).toBe('written before the read\n')
  })

  it('lists a directory there too, which is how skills are discovered', async () => {
    const { ctx, home } = await composed({ sandbox: true })
    await writeFile(join(home, 'a.md'), 'a')
    await writeFile(join(home, 'b.md'), 'b')

    const entries = await ctx.fs.listDir(await ctx.fs.resolve(home))
    expect(entries.map(entry => entry.name).filter(name => name.endsWith('.md'))).toEqual(['a.md', 'b.md'])
  })

  it('keeps the fence, which is the proof the policy is consulted at all', async () => {
    // Read-only rather than a path outside the workspace: `workspace-write`
    // permits the platform temp areas by design, and a test home lives in
    // one. What matters here is that the provider reaches the policy — the
    // read it could not make when the router built it by hand.
    const { ctx, home } = await composed({ sandbox: true, mode: 'read-only' })
    const target = await ctx.fs.resolve(join(home, 'note.txt'))
    await expect(ctx.fs.writeText(target, 'nope')).rejects.toMatchObject({ code: 'FS_SANDBOX_DENIED' })
  })

  it('serves a composition with no policy at all', async () => {
    const { ctx, home } = await composed({ sandbox: false })
    const path = join(home, 'note.txt')
    await writeFile(path, 'no fence here\n')
    expect(await ctx.fs.readText(await ctx.fs.resolve(path))).toBe('no fence here\n')
  })
})
