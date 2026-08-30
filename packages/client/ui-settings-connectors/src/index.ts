/**
 * Connections settings surface, node half.
 *
 * The whole section is browser work: it reads the connector list over the
 * host API and asks the host to run one approval. The empty apply exists only
 * to give the Loader a row whose `dsh.client` declaration ships the browser
 * half.
 */

/** Host plugin body — this package contributes browser behavior only. */
export function apply(): void {}
