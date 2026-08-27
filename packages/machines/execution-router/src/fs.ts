/**
 * The routed filesystem as its own plugin entry.
 *
 * A composition mounts the two routed providers as two rows, so each needs a
 * default export of its own; the pair still has to name the same machine,
 * which they do by reading one machine list.
 * @module @unieai/uad-execution-router/fs
 */

export { RoutedFileSystem as default, RoutedFileSystem } from './index.ts'
export { Config } from './index.ts'
