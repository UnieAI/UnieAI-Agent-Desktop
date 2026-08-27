/**
 * Running one filesystem command on the machine.
 *
 * The `ssh` client is spawned directly here rather than through
 * `ctx.subprocess`. That seam's provider on a remote deployment is itself an
 * SSH adapter, so asking it to read a file would be circular; the same
 * exemption the harness grants other spawners that cannot route through the
 * service (`scrubbedParentEnv` exists for them) applies.
 *
 * File contents arrive as BYTES and stay bytes until the caller decodes them.
 * A text-mode transport would replace an invalid sequence with U+FFFD, and
 * the filesystem seam's contract is to REJECT such a file, not to hand back a
 * silently corrected version of it.
 */

import { spawn } from 'node:child_process'
import type { SshHosts } from '@unieai/uad-ssh'
import { scrubbedParentEnv } from '@unieai/uad-subprocess'

/** What one remote command produced. */
export interface RemoteResult {
  /** Exit status; 255 is the client's own failure, not the command's. */
  code: number
  /** Everything the command wrote to stdout. */
  stdout: Uint8Array
  /** Everything it wrote to standard error, decoded for a message. */
  stderr: string
}

/** Options for one remote command. */
export interface RemoteOptions {
  /** Bytes to write to the command's stdin, then close it. */
  stdin?: Uint8Array | undefined
  /** Aborts the command; the client is killed and the promise rejects. */
  signal?: AbortSignal | undefined
  /**
   * Refuse once stdout exceeds this many bytes.
   *
   * Enforced while reading rather than after: a caller asking for at most a
   * megabyte must not first buffer a gigabyte to find out it was too large.
   */
  maxBytes?: number | undefined
}

/** Raised when a read passes the caller's byte ceiling. */
export class RemoteTooLarge extends Error {
  constructor() {
    super('remote output exceeded the caller\'s byte limit')
    this.name = 'RemoteTooLarge'
  }
}

/**
 * Run one command on the machine and collect what it wrote.
 * @param hosts - the machine book supplying connection arguments.
 * @param machine - the alias to run on.
 * @param line - the remote command line.
 * @param options - stdin, cancellation, and the stdout ceiling.
 * @returns the exit status and both streams.
 */
export async function runRemote(
  hosts: SshHosts,
  machine: string,
  line: string,
  options: RemoteOptions = {},
): Promise<RemoteResult> {
  await hosts.ensureControlDir()
  const [command, ...argv] = hosts.argvFor(machine, line)
  const child = spawn(command as string, argv, {
    env: scrubbedParentEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  const chunks: Buffer[] = []
  let size = 0
  let overflow = false
  const errors: Buffer[] = []

  const finished = new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => { resolve(code ?? -1) })
  })

  child.stdout.on('data', (chunk: Buffer) => {
    if (overflow) return
    size += chunk.byteLength
    if (options.maxBytes !== undefined && size > options.maxBytes) {
      overflow = true
      chunks.length = 0
      child.kill('SIGKILL')
      return
    }
    chunks.push(chunk)
  })
  child.stderr.on('data', (chunk: Buffer) => { errors.push(chunk) })

  const onAbort = (): void => { child.kill('SIGKILL') }
  options.signal?.addEventListener('abort', onAbort, { once: true })

  if (options.stdin !== undefined) child.stdin.end(options.stdin)
  else child.stdin.end()

  try {
    const code = await finished
    if (overflow) throw new RemoteTooLarge()
    return { code, stdout: Buffer.concat(chunks), stderr: Buffer.concat(errors).toString('utf8') }
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Run one command and stream its stdout as it arrives.
 *
 * Separate from {@link runRemote} because a whole-file read and a streamed
 * read differ in what they can promise: this one never holds the file, so it
 * cannot report a byte ceiling before the caller has seen the bytes.
 * @param hosts - the machine book supplying connection arguments.
 * @param machine - the alias to run on.
 * @param line - the remote command line.
 * @param signal - aborts the stream, between chunks included.
 * @returns the byte chunks in order.
 */
export async function* streamRemote(
  hosts: SshHosts,
  machine: string,
  line: string,
  signal?: AbortSignal,
): AsyncGenerator<Uint8Array> {
  await hosts.ensureControlDir()
  const [command, ...argv] = hosts.argvFor(machine, line)
  const child = spawn(command as string, argv, { env: scrubbedParentEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
  const onAbort = (): void => { child.kill('SIGKILL') }
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    for await (const chunk of child.stdout) yield chunk as Uint8Array
    const code = await new Promise<number>(resolve => child.on('close', (c) => { resolve(c ?? -1) }))
    if (code !== 0 && signal?.aborted !== true) {
      throw new Error(`remote read ended with status ${String(code)}`)
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    child.kill('SIGKILL')
  }
}
