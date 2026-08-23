/**
 * Notifications settings surface, node half. The section, the completion
 * watcher, and the sound preference all live in the browser: a turn's
 * running→idle edge is already on the client's session list, and the cue is a
 * per-device preference this host never sees. The empty apply exists only to
 * give the Loader a row whose `dsh.client` declaration ships the browser half.
 */

/** Host plugin body — this package contributes browser behavior only. */
export function apply(): void {}
