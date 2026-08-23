/**
 * Plugins page plugin, node half. Pure UI plugin: the empty apply exists so
 * the plugin appears in the host cordis.yml / Loader; the browser half ships
 * via exports["./client"], discovered through the package.json dsh.client
 * declaration.
 *
 * The page's two areas are supplied by other packages and by this one's own
 * browser half; nothing on this surface reaches the host directly.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
