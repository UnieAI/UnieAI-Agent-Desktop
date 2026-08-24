/**
 * host domain contract. No protocol version: client and host ship
 * together; introduce protocolVersion only when an independently released client appears.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One directory row of a listing: a child entry or a breadcrumb ancestor. */
export interface DirectoryEntry {
  /** Base name shown in a browser row (a root crumb carries its full path). */
  name: string
  /** Absolute host path — the client never joins path segments itself. */
  path: string
  /** Hidden by the host platform's convention (dot-prefixed on POSIX); the client owns whether to show it. */
  hidden: boolean
}

/** One child of a listed workspace directory. */
export interface WorkspaceEntry {
  /** Basename inside the listed directory. */
  name: string
  /** Absolute host path — the client never joins path segments itself. */
  path: string
  /** What the child is; `other` covers sockets, devices, and unresolvable symlinks. */
  kind: 'file' | 'directory' | 'other'
  /** Byte size of a regular file, when the backend reports it. */
  size?: number
}

/** host.readWorkspaceFile response value: one file's text, or why it was withheld. */
export interface WorkspaceFile {
  /** The workspace root the read was resolved against. */
  root: string
  /** Absolute path of the file read. */
  path: string
  /** The file's UTF-8 text, absent when `reason` says why it was not read. */
  text?: string
  /** Byte size as the filesystem reports it. */
  size: number
  /**
   * Opaque freshness token of the file when it was read. A writer hands it
   * back so the filesystem can refuse a write over a file that has moved on;
   * absent when the content was withheld, which is a file nobody can edit
   * from here anyway.
   */
  version?: string
  /**
   * Why `text` is absent: `too-large` for a file over the deployment's bound,
   * `binary` for content that is not decodable text. Absent when `text` is
   * present.
   */
  reason?: 'too-large' | 'binary'
}

/** host.listWorkspaceEntries response value: one level inside one workspace. */
export interface WorkspaceListing {
  /** The workspace root this level was resolved against. */
  root: string
  /** Absolute path of the listed directory; equal to `root` at the top. */
  path: string
  /** Children, directories first then files, each group name-sorted. */
  entries: WorkspaceEntry[]
  /** True when the listing was cut at its bound; the sorted tail is absent. */
  truncated: boolean
}

/** host.listDirectory response value: one directory level plus its ancestry. */
export interface DirectoryListing {
  /** Absolute path of the listed directory. */
  path: string
  /** The host account's home directory (breadcrumb "Home" rooting). */
  home: string
  /**
   * Ancestor chain from the filesystem root to the listed directory
   * inclusive; every crumb is a jump target (crumb `hidden` is always false).
   */
  crumbs: DirectoryEntry[]
  /** Direct child directories, name-sorted; symlinks to directories included. */
  entries: DirectoryEntry[]
  /** True when the backend cut `entries` at its complete-result bound (the name-sorted tail is absent). */
  truncated: boolean
}

/** Host-level unary methods. */
export interface HostApi {
  /**
   * One-shot host snapshot. Empty payload uses the literal `{}` (extend in place when fields arrive).
   * version = the host app's (apps/cli) package.json version; cwd = the host process working
   * directory (root for session persistence and tool execution); provider/model = the defaults
   * applied when a new agent doesn't specify them explicitly, absent when the host configures
   * no explicit default (the adapter falls back internally);
   * attachedSessions = count of currently attached sessions (those with a live agent);
   * home = the host account home directory (Web display abbreviation on POSIX);
   * canOpenPath = whether this deployment can hand a path to a user-visible native desktop.
   */
  describe(request: RpcRequest<{}>): Promise<RpcResponse<{
    version: string
    cwd: string
    provider?: string
    model?: string
    attachedSessions: number
    home: string
    canOpenPath: boolean
  }>>

  /**
   * Open the operating system's single-directory picker; cancellation returns
   * null. Only served under the `native` capability.
   */
  pickDirectory(
    request: RpcRequest<{}>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ path: string | null }>>

  /**
   * List one directory level for the in-app browser; an absent path lists the
   * host account's home directory. Only served under the `browse` capability;
   * unreadable or missing targets fail with `directory-unreadable`. The
   * carrier's request signal follows the caller, stopping the backend's scan
   * on disconnect or timeout.
   */
  listDirectory(
    request: RpcRequest<{ path?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<DirectoryListing>>

  /**
   * Create one child directory under an existing parent (the browser's
   * "New folder"). Only served under the `browse` capability; an existing
   * child fails with `directory-exists`, every other filesystem failure with
   * `directory-create-failed`.
   */
  createDirectory(
    request: RpcRequest<{ path: string; name: string }>,
  ): Promise<RpcResponse<{ path: string }>>

  /**
   * List one directory level INSIDE a workspace, for a client showing the
   * files a session works on.
   *
   * Deliberately not `listDirectory` with a filter. That operation serves the
   * directory picker: it lists directories anywhere the host account can
   * read, because picking a workspace means reaching one you have not opened
   * yet. This one publishes file names to a page, so it is bounded instead —
   * `root` must be a path the workspace registry already holds, and `path`
   * must resolve inside it. A page cannot widen either.
   *
   * Names only. Sizes and kinds come along because a listing already knows
   * them; content does not, and no argument here can ask for it.
   */
  listWorkspaceEntries(
    request: RpcRequest<{ root: string; path?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<WorkspaceListing>>

  /**
   * Read one file INSIDE a workspace, as text, for a viewer.
   *
   * The same fence as {@link listWorkspaceEntries}: `root` must be a path the
   * workspace registry already holds and `path` must resolve inside it. This
   * one publishes CONTENT rather than names, so it is bounded twice — by that
   * fence, and by a size the deployment sets: a viewer that streamed an
   * arbitrary file into a page would be a way to read anything the host
   * account can, one request at a time.
   *
   * See {@link writeWorkspaceFile} for the write counterpart and the extra
   * conditions it carries.
   */
  readWorkspaceFile(
    request: RpcRequest<{ root: string; path: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<WorkspaceFile>>

  /**
   * Write one file INSIDE a workspace, as text, from a viewer that edited it.
   *
   * The same registered-root fence as the read, and the same size bound
   * applied to what is being written rather than to what is being sent back.
   *
   * IT REPLACES ONLY WHAT WAS READ. The request carries the `version` the read
   * returned, and the filesystem's own atomic guard refuses the write when the
   * file has moved on. An editor open beside an agent working in the same tree
   * is the ordinary case here, not the exotic one — without that guard, saving
   * a buffer opened two minutes ago would silently discard whatever the agent
   * wrote in between, and the person would never learn it happened. The guard
   * is the version rather than a content comparison because a comparison this
   * layer performs has a window between the check and the write; the
   * filesystem's does not.
   *
   * IT CREATES NOTHING. `path` must already exist inside the root. A viewer
   * that could create files would be a way to place content anywhere the host
   * account can write, and creating a file is not editing one.
   */
  writeWorkspaceFile(
    request: RpcRequest<{ root: string; path: string; text: string; version: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ version: string }>>

  /**
   * Open a filesystem path with the operating system's default application
   * (Finder / Explorer / xdg-open hand-off). The browser carrier's
   * prefix-wide trust fence covers this privileged method like every other
   * `/api` request.
   */
  openPath(
    request: RpcRequest<{ path: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ opened: true }>>
}
