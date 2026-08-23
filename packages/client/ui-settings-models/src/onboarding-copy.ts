/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-08-22.unieai.1'

/** The complete editable internal-testing notice in both supported GUI locales. */
export const WELCOME_NOTICE_COPY = {
  zh: {
    title: '开发者预览',
    body: 'UnieAI Agent 目前处于开发者预览阶段，功能与接口都会持续快速演进，过程中可能出现不兼容的变更。\n\n它构建在开源、可组合的插件式基础设施之上：模型、工具、会话记录乃至智能体循环本身都是可替换的插件。欢迎在使用中提出反馈，与我们一起把它打磨得更好。',
    continueLabel: '继续',
  },
  en: {
    title: 'Developer Preview',
    body: 'UnieAI Agent is in developer preview. Features and interfaces are still moving quickly, and compatibility-breaking changes are expected along the way.\n\nIt is built on open, composable plugin infrastructure: the model adapter, the tool registry, the session log, and the agent loop itself are all replaceable plugins. We welcome your feedback as we refine it.',
    continueLabel: 'Continue',
  },
} as const
