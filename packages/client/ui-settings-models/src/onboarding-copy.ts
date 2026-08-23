/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-08-22.unieai.1'

/** The complete editable internal-testing notice in every shipped GUI locale. */
export const WELCOME_NOTICE_COPY = {
  zh: {
    title: '开发者预览',
    body: 'UnieAI Agent 目前处于开发者预览阶段，功能与接口都会持续快速演进，过程中可能出现不兼容的变更。\n\n它构建在开源、可组合的插件式基础设施之上：模型、工具、会话记录乃至智能体循环本身都是可替换的插件。欢迎在使用中提出反馈，与我们一起把它打磨得更好。',
    continueLabel: '继续',
  },
  zhTW: {
    title: '開發者預覽',
    body: 'UnieAI Agent 目前處於開發者預覽階段，功能與介面都會持續快速演進，過程中可能出現不相容的變更。\n\n它建構在開源、可組合的外掛式基礎架構之上：模型、工具、工作階段紀錄乃至智慧代理迴圈本身都是可替換的外掛。歡迎在使用中提出回饋，與我們一起把它打磨得更好。',
    continueLabel: '繼續',
  },
  ja: {
    title: '開発者プレビュー',
    body: 'UnieAI Agent は開発者プレビューの段階です。機能もインターフェースもまだ速いペースで動いており、途中で互換性のない変更が入ることがあります。\n\nオープンで組み替え可能なプラグイン基盤の上に作られています。モデルアダプター、ツールレジストリ、セッションログ、そしてエージェントループ自体まで、すべて差し替え可能なプラグインです。改善のためのご意見をお待ちしています。',
    continueLabel: '続ける',
  },
  en: {
    title: 'Developer Preview',
    body: 'UnieAI Agent is in developer preview. Features and interfaces are still moving quickly, and compatibility-breaking changes are expected along the way.\n\nIt is built on open, composable plugin infrastructure: the model adapter, the tool registry, the session log, and the agent loop itself are all replaceable plugins. We welcome your feedback as we refine it.',
    continueLabel: 'Continue',
  },
} as const
