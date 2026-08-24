/**
 * Browser conversation plugin. `contract/` is the shared type boundary
 * between the independently implemented skeleton and chat domains; `apply.ts`
 * owns their slot assembly.
 */
export type {} from './conversation-nodes/assistant.ts'
export type {} from './conversation-nodes/command.ts'
export type {} from './conversation-nodes/compaction.ts'
export type {} from './conversation-nodes/fallback.ts'
export type {} from './conversation-nodes/message.ts'
export type {} from './conversation-nodes/retry.ts'
export type {} from './conversation-nodes/tool.ts'
export type {} from './conversation-nodes/turn-error.ts'
export type {} from './conversation-nodes/turn-max-tokens.ts'
export type {} from './conversation-nodes/turn-tail.ts'

// The diff derivation the tool rows and the panel's Review tab share. It lives
// here because the dependency runs ui-tool → ui-conversation: the panel cannot
// import the rows' package, and one derivation is what keeps the two readings
// of a change from disagreeing.
export { CHAT_DIFF_MAX_LINES, diffCardModel, diffSummarySuffix } from './diff-card-model.ts'
export type { DiffCardModel } from './diff-card-model.ts'
export { apply, inject } from './apply.ts'
export { ConversationController } from './service.ts'
export type { IConversation } from './service.ts'
export type { DraftAttachmentId } from './input/contract.ts'

export type {
  CallId, ChatStoreState, SelectionTarget, ViewTab,
} from './contract/views.ts'
export type { ConversationKey } from './locales.ts'
export type {
  AssistantChatData, ChatNode, ChatNodeDataMap, ChatNodeKind, ManualCompactionChatData,
  RetryChatData, ToolChatData, TurnTailChatData,
} from './contract/chat-nodes.ts'
export type {
  ChatFileMentions, ChatNodeOwnerProps, ChatNodeViewProps,
  ChatStore, ChatViewInjected, ChatViewSlotProps, CommandRowOwnerProps, CommandRowProps, ComposerBarInjected,
  ComposerAttachment, ComposerAttachmentsOwnerProps, ComposerAttachmentsProps, ComposerChainProps, ConversationInjected,
  ConversationHeaderLineageOwnerProps, ConversationSessionHeaderInjected, ConversationSessionInjected,
  ConversationSlotProps, ConvViewOwnerProps,
  ConvViewProps, DetailsInjected, DetailsSlotProps, DetailsToolOwnerProps, EmptyWorkspaceOwnerProps, HeroBrandMarkOwnerProps,
  MessageImagesOwnerProps, MessageImagesProps, RenderMessageImages, TurnTailOwnerProps, UseChatNodeTurnData,
} from './contract/slots.ts'
// Export discipline: packages/client/AGENTS.md.

declare module '@unieai/cordis' {
  interface Context {
    /** The outward face only; the concrete service stays inside this plugin. */
    conversation: import('./service.ts').IConversation
  }
}
