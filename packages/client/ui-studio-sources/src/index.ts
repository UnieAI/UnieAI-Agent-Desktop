/**
 * Studio knowledge-base citations, node half.
 *
 * Pure UI plugin: the empty apply exists so the plugin appears in the host
 * cordis.yml / Loader, and the browser half ships through
 * `exports["./client"]`. The reading itself is `@unieai/uad-studio-kb-sources`,
 * which needs no host: the text it parses is already in the browser, inside
 * the tool result the person opened.
 *
 * @module @unieai/uad-client-ui-studio-sources
 */

/** Cordis plugin name. */
export const name = 'ui-studio-sources'

/** Host plugin body — this feature reads what the browser already has. */
export function apply(): void {}
