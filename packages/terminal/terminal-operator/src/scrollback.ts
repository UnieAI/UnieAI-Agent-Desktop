/**
 * Bounded replay buffer for one operator terminal.
 * @module @unieai/uad-terminal-operator/scrollback
 */

/**
 * Byte-bounded FIFO of terminal output chunks.
 *
 * A terminal panel that is closed and reopened, or a browser that reconnects
 * after a dropped websocket, has to repaint something: without a replay buffer
 * the user comes back to a blank rectangle in front of a shell that is very
 * much still running. The bound is on bytes rather than chunks because a chunk
 * is whatever the PTY happened to hand over — one keystroke echo or a
 * megabyte of `cat`.
 *
 * Trimming drops whole chunks from the front, so a repaint can begin partway
 * through an escape sequence written before the bound was reached. That is the
 * same thing a terminal emulator does when its own scrollback overflows, and
 * xterm.js resynchronizes on the next complete sequence.
 */
export class Scrollback {
  private readonly chunks: string[] = []
  private bytes = 0

  /**
   * @param maxBytes - retention bound; the buffer holds at most this many UTF-8 bytes.
   */
  constructor(private readonly maxBytes: number) {}

  /**
   * Append one chunk and evict from the front until the bound holds.
   * @param chunk - terminal output as delivered.
   */
  push(chunk: string): void {
    if (chunk.length === 0) return
    this.chunks.push(chunk)
    this.bytes += Buffer.byteLength(chunk, 'utf8')
    while (this.bytes > this.maxBytes && this.chunks.length > 1) {
      const evicted = this.chunks.shift()
      /* v8 ignore next -- length is checked by the loop condition */
      if (evicted === undefined) break
      this.bytes -= Buffer.byteLength(evicted, 'utf8')
    }
  }

  /**
   * Project the retained output for a repaint.
   * @returns everything retained, in delivery order, as one string.
   */
  read(): string {
    return this.chunks.join('')
  }

  /** Drop everything retained. */
  clear(): void {
    this.chunks.length = 0
    this.bytes = 0
  }
}
