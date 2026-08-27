/**
 * The remote-machine bundle.
 *
 * Composition only: the whole bundle is `cordis.patch.yml`, which replaces
 * the two rows that define an execution world — `ctx.fs` and
 * `ctx.subprocess` — with providers pointed at a machine reached over SSH,
 * and turns off the local sandbox rows that cannot confine work happening on
 * another computer.
 *
 * There is no code here because there is nothing to run: every capability
 * above those two seams already consumes them without naming a provider.
 *
 * @module @unieai/uad-remote-machine
 */

/** Cordis plugin name. */
export const name = 'remote-machine'

/** Bundle body — this bundle is its patch layer. */
export function apply(): void {}
