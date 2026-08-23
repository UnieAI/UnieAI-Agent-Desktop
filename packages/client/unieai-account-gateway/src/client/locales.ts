/**
 * The text this package owns, in every locale the client ships.
 *
 * The account contract says labels and failure messages arrive at the section
 * already localized, because only the supplier knows what its own figures are
 * called. This package is that supplier, so the allowance names and the two
 * failure lines are translated here rather than in the section's dictionary.
 *
 * The copy is a plain table rather than a `ctx.locale` namespace: these
 * strings are data carried inside the account snapshot, not the copy of a
 * rendered slot, and a namespace would put them behind a `t` seat that no
 * component in this package owns.
 */
import type { LocaleId } from '@deepseek-ai/dsh-client-locale/client'

/**
 * The product's meter keys, in the order the usage list presents them: the
 * two agent allowances a task actually spends first, then chat, then the
 * call counters, then the session and page counts.
 */
export const METER_KEYS = [
  'agentTurns', 'agentTokens', 'chatTokens', 'mcpCalls', 'toolCalls', 'agentSessions', 'vlmPages',
] as const

/** One allowance key reported by the product's `/api/desktop/usage`. */
export type MeterKey = typeof METER_KEYS[number]

/**
 * Stable contract id per meter key. Written out rather than derived from the
 * key, because the id is a published identifier of the seam and must not move
 * when someone rewrites a spelling rule.
 */
export const METER_QUOTA_IDS: Readonly<Record<MeterKey, string>> = {
  agentTurns: 'agent-turns',
  agentTokens: 'agent-tokens',
  chatTokens: 'chat-tokens',
  mcpCalls: 'mcp-calls',
  toolCalls: 'tool-calls',
  agentSessions: 'agent-sessions',
  vlmPages: 'vlm-pages',
}

/** The product's own state names for one sent invite. */
export const INVITE_STATES = ['pending', 'joined', 'rewarded'] as const

/** One invite state this build can name. */
export type InviteState = typeof INVITE_STATES[number]

/** Everything this package puts into words. */
export interface GatewayCopy {
  /** Allowance names, by the product's meter key. */
  meters: Readonly<Record<MeterKey, string>>
  /** The gate answered, but the product would not describe the account. */
  productUnavailable: string
  /** The gate itself could not be reached, or answered something unreadable. */
  hostUnreachable: string
  /**
   * Unit suffixes for the three activity figures that are not plain counts,
   * taken verbatim from the product's own `SettingsPage.profileStats` copy —
   * the same three suffixes its profile page prints, so `2h 5m` and `3d` read
   * identically on both surfaces.
   */
  units: {
    /** Hours suffix of the longest-task reading. */
    hour: string
    /** Minutes suffix of the longest-task reading. */
    minute: string
    /** Days suffix of both streak readings. */
    day: string
  }
  /** Where one sent invite stands, by the product's own state name. */
  inviteStates: Readonly<Record<InviteState, string>>
}

const en: GatewayCopy = {
  meters: {
    agentTurns: 'Agent turns',
    agentTokens: 'Agent tokens',
    chatTokens: 'Chat tokens',
    mcpCalls: 'MCP calls',
    toolCalls: 'Tool calls',
    agentSessions: 'Agent sessions',
    vlmPages: 'VLM pages',
  },
  productUnavailable: 'UnieAI could not report this account right now.',
  hostUnreachable: 'The account could not be read from this desktop.',
  units: { hour: 'h', minute: 'm', day: 'd' },
  inviteStates: { pending: 'Pending', joined: 'Joined', rewarded: 'Rewarded' },
}

const zhCN: GatewayCopy = {
  meters: {
    agentTurns: '智能体轮次',
    agentTokens: '智能体 Token',
    chatTokens: '对话 Token',
    mcpCalls: 'MCP 调用',
    toolCalls: '工具调用',
    agentSessions: '智能体会话',
    vlmPages: 'VLM 页数',
  },
  productUnavailable: 'UnieAI 目前无法回报此账号的信息。',
  hostUnreachable: '桌面端无法读取账号信息。',
  units: { hour: ' 小时', minute: ' 分', day: '天' },
  inviteStates: { pending: '待加入', joined: '已加入', rewarded: '已奖励' },
}

const zhTW: GatewayCopy = {
  meters: {
    agentTurns: '智慧體輪次',
    agentTokens: '智慧體 Token',
    chatTokens: '對話 Token',
    mcpCalls: 'MCP 呼叫',
    toolCalls: '工具呼叫',
    agentSessions: '智慧體工作階段',
    vlmPages: 'VLM 頁數',
  },
  productUnavailable: 'UnieAI 目前無法回報此帳號的資訊。',
  hostUnreachable: '桌面端無法讀取帳號資訊。',
  units: { hour: ' 小時', minute: ' 分', day: '天' },
  inviteStates: { pending: '待加入', joined: '已加入', rewarded: '已獎勵' },
}

const ja: GatewayCopy = {
  meters: {
    agentTurns: 'エージェントのターン数',
    agentTokens: 'エージェントのトークン',
    chatTokens: 'チャットのトークン',
    mcpCalls: 'MCP 呼び出し',
    toolCalls: 'ツール呼び出し',
    agentSessions: 'エージェントのセッション',
    vlmPages: 'VLM ページ',
  },
  productUnavailable: 'UnieAI は現在このアカウントの情報を返せません。',
  hostUnreachable: 'このデスクトップからアカウント情報を読み取れませんでした。',
  units: { hour: '時間', minute: '分', day: '日' },
  inviteStates: { pending: '保留中', joined: '参加済み', rewarded: '報酬付与' },
}

/** Copy for every shipped locale; the record is total, so no key falls back. */
export const COPY: Readonly<Record<LocaleId, GatewayCopy>> = { 'en': en, 'zh-CN': zhCN, 'zh-TW': zhTW, 'ja': ja }
