/**
 * The machine gauges, node half.
 *
 * Pure UI plugin: the empty apply exists so the plugin appears in the host
 * cordis.yml / Loader, and the browser half ships through
 * `exports["./client"]`. Every number it draws is sampled on the machine by
 * the host's own metrics service and arrives over the ordinary wire.
 *
 * @module @unieai/uad-client-ui-machine-gauges
 */

/** Cordis plugin name. */
export const name = 'ui-machine-gauges'

/** Host plugin body — the reading is the host's own service. */
export function apply(): void {}
