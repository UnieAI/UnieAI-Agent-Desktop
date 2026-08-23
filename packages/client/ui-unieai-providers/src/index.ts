/**
 * UnieAI API Provider settings plugin, node half. Pure UI plugin: the empty
 * apply exists so the plugin appears in the host cordis.yml / Loader; the
 * browser half ships via exports["./client"], discovered through the
 * package.json dsh.client declaration.
 *
 * The provider data belongs to the UnieAI Copilot web product and is reached
 * through the sign-in gate's `/auth/providers` route, which lives in
 * `@unieai/uad-unieai-web-gate` — the host package that holds the API key
 * this desktop authenticates that product with.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
