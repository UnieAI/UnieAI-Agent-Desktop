/**
 * Login-shell resolution for the operator terminal.
 * @module @unieai/uad-terminal-operator/shell
 */

/**
 * The name a terminal tab carries: `user@host`, as a terminal emulator titles
 * its window.
 * @param env - environment to read the account name from.
 * @param hostname - this machine's hostname.
 * @returns the tab title.
 */
export function operatorTerminalTitle(
  env: Record<string, string | undefined>,
  hostname: string,
): string {
  // A container or a stripped environment may name neither; `shell` is a
  // truthful stand-in for "we could not tell you whose account this is",
  // which is better than printing `undefined@` at someone.
  const user = env['USER'] ?? env['LOGNAME'] ?? env['USERNAME'] ?? 'shell'
  // Trailing domain labels are noise in a 156px tab: `ip-10-0-0-1` says as
  // much as `ip-10-0-0-1.eu-west-1.compute.internal` and fits.
  const host = hostname.split('.')[0] ?? hostname
  return host === '' ? user : `${user}@${host}`
}

/** Fallbacks tried in order when the environment names no usable shell. */
const FALLBACK_SHELLS = ['/bin/bash', '/bin/sh'] as const

/**
 * Choose the program an operator terminal runs.
 *
 * The shell is spawned with NO flags. On a PTY, bash and its relatives decide
 * they are interactive from the terminal alone and read the interactive rc
 * file — `~/.bashrc`, which is where oh-my-bash, starship, aliases and the
 * prompt actually live. Adding `-l` would make it a LOGIN shell instead, which
 * reads `~/.bash_profile` or `~/.profile` and skips `~/.bashrc` unless one of
 * those happens to source it; a user whose whole configuration is in `.bashrc`
 * would get a bare `$` prompt and none of their aliases. Terminal emulators on
 * Linux spawn the interactive non-login shell for exactly this reason.
 *
 * @param env - environment to read `SHELL` from.
 * @param exists - predicate answering whether an absolute path is present.
 * @returns the absolute program path, or undefined when nothing is runnable.
 */
export function resolveOperatorShell(
  env: Record<string, string | undefined>,
  exists: (path: string) => boolean,
): string | undefined {
  const named = env['SHELL']
  // A relative or empty SHELL is not resolvable without a PATH search, and a
  // PATH search here would pick a different shell than the user's login did.
  if (named !== undefined && named.startsWith('/') && exists(named)) return named
  return FALLBACK_SHELLS.find(candidate => exists(candidate))
}

/**
 * Build the environment an operator terminal starts with.
 *
 * `TERM` is set because the shell and every full-screen program it runs read
 * it to decide what escape sequences they may emit; xterm.js speaks the xterm
 * repertoire including 256 colours. `COLORTERM` is what most prompts check
 * before using 24-bit colour.
 *
 * @param env - ambient environment to layer over.
 * @returns the explicit environment for the spawn.
 */
export function operatorTerminalEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const resolved: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) resolved[key] = value
  }
  resolved['TERM'] = 'xterm-256color'
  resolved['COLORTERM'] = 'truecolor'
  return resolved
}
