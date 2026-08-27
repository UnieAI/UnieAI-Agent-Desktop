/**
 * The machine control, node half.
 *
 * Pure UI plugin: the empty apply exists so the plugin appears in the host
 * cordis.yml / Loader, and the browser half ships through
 * `exports["./client"]`. Everything it shows comes from the host's machine
 * list over the ordinary wire.
 *
 * @module @unieai/uad-client-ui-machines
 */

/** Cordis plugin name. */
export const name = 'ui-machines'

/** Host plugin body — the machine list is the host's own service. */
export function apply(): void {}
