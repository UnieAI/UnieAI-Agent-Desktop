/**
 * UnieAI account gateway, node half. The account data is read by the browser
 * from the host gate's `/auth/account` route, which
 * `@unieai/uad-unieai-web-gate` owns; this package therefore contributes
 * nothing on the host and the empty apply exists only to give the Loader a row
 * whose `dsh.client` declaration ships the browser half.
 */

/** Host plugin body — this package contributes browser behavior only. */
export function apply(): void {}
