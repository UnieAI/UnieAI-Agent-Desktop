/**
 * skills domain contract: reading the skill catalog, by session or by
 * deployment.
 * The session's header cwd resolves to the canonical project root host-side —
 * the client never submits a raw path, and skill lookup never creates or
 * resumes an Agent.
 */

import type { SessionId } from '@unieai/uad-session/types'
import type { RpcRequest, RpcResponse } from './rpc.ts'

/** Skill catalog row (wire projection of the host SkillSummary; provider/source vocabulary stays host-side). */
export interface SkillEntry {
  /** Kebab-case identifier the user references as `/name` in the composer. */
  readonly name: string
  /** Short routing description. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** False marks a user-only skill (`disable-model-invocation`): invocable here, absent from the model catalog. */
  readonly modelInvocable: boolean
}

/** One catalog row, as a surface that manages skills needs it. */
export interface SkillCatalogEntry extends SkillEntry {
  /** Which root it came from: what this build ships, the person's own, or a project's. */
  readonly source: string
  /** Provider that owns the body; a surface groups by it when several disagree. */
  readonly provider: string
  /** Absolute file, when the provider has one; absent for a skill with no file to open. */
  readonly path?: string
  /** Whether a person can invoke it from the composer. */
  readonly userInvocable: boolean
}

/** What one install wrote, so a surface can name the file and re-read. */
export interface SkillInstallResult {
  /** The skill's own name, as the account stores it. */
  readonly name: string
  /** Absolute file this host wrote. */
  readonly path: string
  /** Whether a file was already there and has been replaced. */
  readonly replaced: boolean
}

/**
 * Skill-domain unary methods (the map key skill.* of RpcMethodMap). Reading
 * and copying only: invocation itself is a plain `session.prompt` whose
 * leading `/name` token the host recognizes at the pre-step boundary
 * (`dsh-tool-skill` injects the rendered body there), so every client shares
 * one deterministic path with no dedicated invocation wire.
 */
export interface SkillsApi {
  /** Lists the user-invocable skill catalog for the session's project. */
  list(request: RpcRequest<{ sessionId: SessionId }>): Promise<RpcResponse<{ skills: readonly SkillEntry[] }>>

  /**
   * Lists the whole catalog a surface can manage, with where each skill
   * lives.
   *
   * Addressed by deployment rather than by session, because a person
   * managing their skills has not necessarily opened a conversation — and
   * the skills that matter most to manage, the ones they wrote, belong to
   * them rather than to any project. A `cwd` includes that project's own
   * skills as well; without one the answer is what this build ships plus
   * what the person has written.
   *
   * Read-only. Writing a skill is a file operation, and the file is what
   * the person's editor and the agent both already work on.
   */
  catalog(request: RpcRequest<{ cwd?: string }>): Promise<RpcResponse<{ skills: readonly SkillCatalogEntry[] }>>

  /**
   * Copy one skill from the signed-in UnieAI account onto this machine.
   *
   * The client sends a slug and nothing else. The document is fetched here,
   * through the account gate that holds the API key, so a browser cannot
   * choose what gets written into a skills directory — the whole point of the
   * route is that the bytes come from the account rather than from the page.
   *
   * A copy, not a link: the file becomes this machine's, editing it here
   * changes nothing on the account, and installing again replaces it. That
   * last fact is reported rather than hidden, because the file it replaces
   * may be one someone edited.
   */
  install(
    request: RpcRequest<{ slug: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<SkillInstallResult>>
}
