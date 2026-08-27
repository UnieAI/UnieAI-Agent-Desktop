/** Platform-neutral assembly of generated Host Remote contributions. */

import type { Context } from '@unieai/cordis'
import commandsRemote from '@unieai/uad-commands/remote'
import goalsRemote from '@unieai/uad-goal/remote'
import dynamicRemote from '@unieai/uad-cordis-host-runner/remote'
import fileReferencesRemote from '@unieai/uad-file-reference/remote'
import pluginInventoryRemote from '@unieai/uad-host-plugin-inventory/remote'
import messageFeedbackRemote from '@unieai/uad-message-feedback/remote'
import sessionReferencesRemote from '@unieai/uad-session-reference/remote'
import type { TypertClientRemote } from '@unieai/uad-typert-protocol'

export type { TypertClientRemote as ClientRemote } from '@unieai/uad-typert-protocol'
export type { PluginInventorySnapshot } from '@unieai/uad-host-plugin-inventory/types'
export type {} from '@unieai/uad-commands/remote'
export type {} from '@unieai/uad-file-reference/remote'
export type {} from '@unieai/uad-goal/remote'
export type {} from '@unieai/uad-host-plugin-inventory/remote'
export type {} from '@unieai/uad-message-feedback/remote'
export type {} from '@unieai/uad-session-reference/remote'
// The forwarded-event allowlist's selection seat: without it in the consumer's
// compilation face `TypertRemoteEvent` is `never` and every `$on` call fails.
export type { ApiRemoteForwardedEvent } from '../types.ts'
// The owner packages' client-safe `./types` exports supply the `Events`
// signatures `$on` hands to a listener, so a consumer reads the very
// declaration the Host emits rather than a flattened restatement of it.
export type {} from '@unieai/uad-commands/types'
export type {} from '@unieai/uad-cordis-host-runner/types'
export type {} from '@unieai/uad-credentials/types'
export type {} from '@unieai/uad-llm/types'
export type {} from '@unieai/uad-agent-presets/types'
export type {} from '@unieai/uad-settings/types'

/**
 * The carrier's Client-facing types, re-exported so a business package names one
 * assembly package instead of both this facade and the Connection plugin. Type-only:
 * the carrier's runtime values stay behind their own module edge.
 */
export type {
  ClientResponse, ConfigurableProviderView, ConnectionHandle, ConnectionSinks, ContentBlock,
  CredentialView, DirectoryListing, DiscoveredModelView, HistoryEntry, HostFrame, IApiClient,
  TerminalOpened, TerminalSignalName, TerminalView, BrowserOpened, BrowserView,
  MessageId, ModelCatalogFailure, ModelProviderGroup, ModelReasoningEffort, ModelSelection,
  MachineAccelerator, MachineEntry, MachineList, MachineMetricsView, MuxFrame, PromptContentPart,
  QuestionResponsePayload, QueueAction, RpcError, RpcId, RpcReceipt,
  RpcRequest, RpcResponse, RpcResult, SessionId, SessionModels, SessionSearchItem,
  SessionSummary, SettingsNamespaceView, SettingsPathOpView, SkillCatalogEntry, SkillEntry, StreamChunk,
  SubagentAddress, SubagentCatalog, JobView, ToolCallView, ToolEventView, ToolResultView,
  WorkspaceEntry, WorkspaceFile, WorkspaceId, WorkspaceListing, WorkspaceView,
} from '@unieai/uad-client-connection/client'
export type {} from '@unieai/uad-api-gateway/client'
export type {} from '@unieai/uad-cordis-host-runner/remote'

// The payload vocabulary of the selected namespaces, re-exported so a Client
// contribution can name what it sends and receives without importing a Host
// package: this assembly is the one place both planes legitimately meet.
export type {
  ApprovalRequestId,
  CordisHalfState,
  CordisDynamicPackageId,
  CordisDynamicPluginId,
  CordisDynamicPluginRunId,
  CordisDynamicRunMode,
  CordisInspectMethodManifest,
  CordisInspectPlatform,
  CordisInspectProviderManifest,
  CordisInspectProviderView,
  CordisInspectQueryRequest,
  CordisInspectQueryResolution,
  CordisInspectQueryResolved,
  CordisInspectRequestId,
  CordisInspectResolveAck,
  CordisRunDiagnostic,
  CordisRunStatus,
  DynamicCordisClientSource,
  DynamicCordisHostHalfResult,
  DynamicCordisInventoryRow,
  DynamicCordisInvokeResult,
  DynamicCordisPackage,
  DynamicCordisRequestResolved,
  DynamicCordisResolveAck,
  DynamicCordisRetracted,
  DynamicCordisRunRequest,
  DynamicCordisRunResolution,
  DynamicCordisRunAttempt,
  DynamicCordisRunResponse,
  DynamicCordisStopResponse,
  DynamicCordisUndefineReceipt,
  RequestRunOutcome,
} from '@unieai/uad-cordis-host-runner/types'
// The JSON vocabulary those payloads are built from, re-exported for the same
// reason: a Client contribution names what it sends without importing a Host
// package, and this assembly is where both planes legitimately meet.
export type { JsonValue } from '@unieai/uad-session/types'
// Reference-discovery result vocabulary for the fileReferences and
// sessionReferenceResolver namespaces.
export type { FileReferenceCandidate } from '@unieai/uad-file-reference/types'
export type { SessionReferenceMentionCandidate } from '@unieai/uad-session-reference/types'

declare module '@unieai/cordis' {
  interface Context {
    /** Generated Remote namespaces selected by this Client assembly. */
    remote: TypertClientRemote
  }
}

/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount the Host capabilities explicitly selected for this Client assembly.
 * @param ctx - Client Cordis root carrying the typed API service.
 * @returns disposer after every selected Remote namespace is ready.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const disposers: Array<() => Promise<void>> = []
  try {
    for (const contribution of [
      commandsRemote, goalsRemote, dynamicRemote, fileReferencesRemote,
      pluginInventoryRemote, messageFeedbackRemote, sessionReferencesRemote,
    ]) {
      disposers.push(await ctx.remote.$mount(contribution))
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) await dispose()
    throw error
  }
  // Unwound in reverse mount order, so a namespace never outlives one mounted
  // after it.
  return async () => {
    for (const dispose of disposers.reverse()) await dispose()
  }
}
