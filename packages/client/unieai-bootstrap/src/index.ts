/**
 * UnieAI startup initialization, node half. The startup answer is read by the
 * browser from the host gate's `/auth/bootstrap` route, which
 * `@unieai/uad-unieai-web-gate` owns and gathers; this package therefore
 * contributes nothing on the host and the empty apply exists only to give the
 * Loader a row whose `dsh.client` declaration ships the browser half.
 */

/** Host plugin body — this package contributes browser behavior only. */
export function apply(): void {}
