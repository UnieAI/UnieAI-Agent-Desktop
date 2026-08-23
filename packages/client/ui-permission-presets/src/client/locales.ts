/** `settings.permission` namespace dictionaries (the Permission row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '权限',
  'description': '选择新会话的默认权限模式',
  'loading': '加载中',
  'unavailable': '不可用',
  'confirm.title': '确认启用 Full access？',
  'confirm.description': '启用 Full access 后，新会话将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任后续任务时使用。',
  'confirm.acknowledge': '我已了解风险，并愿意继续',
  'confirm.cancel': '取消',
  'confirm.enable': '启用 Full access',
} satisfies Record<string, string>

/** The settings.permission namespace key union. */
export type PermissionSettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Permission',
  'description': 'Choose the default permission mode for new sessions',
  'loading': 'Loading',
  'unavailable': 'Unavailable',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<PermissionSettingsKey, string>

/** Simplified Chinese dictionary for the current-session popup gate. */
export const accessZh = {
  'confirm.title': '确认启用 Full access？',
  'confirm.description': '启用 Full access 后，agent 将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。',
  'confirm.acknowledge': '我已了解风险，并愿意继续',
  'confirm.cancel': '取消',
  'confirm.enable': '启用 Full access',
} satisfies Record<string, string>

/** Current-session popup-gate key union. */
export type PermissionAccessKey = keyof typeof accessZh

/** English dictionary for the current-session popup gate. */
export const accessEn = {
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<PermissionAccessKey, string>

/** Traditional Chinese dictionary, checked complete against the zh key set. */
export const zhTW = {
  'title': '權限',
  'description': '選擇新工作階段的預設權限模式',
  'loading': '載入中',
  'unavailable': '無法使用',
  'confirm.title': '確認啟用 Full access？',
  'confirm.description': '啟用 Full access 後，新工作階段將減少確認步驟，並且可以直接執行更多操作，包括敏感操作、檔案修改或外部指令。僅建議在你信任後續任務時使用。',
  'confirm.acknowledge': '我已了解風險，並願意繼續',
  'confirm.cancel': '取消',
  'confirm.enable': '啟用 Full access',
} satisfies Record<PermissionSettingsKey, string>

/** Japanese dictionary, checked complete against the zh key set. */
export const ja = {
  'title': '権限',
  'description': '新しいセッションの既定の権限モードを選択します',
  'loading': '読み込み中',
  'unavailable': '利用できません',
  'confirm.title': 'Full access を有効にしますか？',
  'confirm.description': 'Full access を有効にすると、新しいセッションでは確認の手順が減り、機密性の高い操作、ファイルの変更、外部コマンドなど、より多くの操作を直接実行できるようになります。以降のタスクを信頼できる場合にのみ使用してください。',
  'confirm.acknowledge': 'リスクを理解したうえで続行します',
  'confirm.cancel': 'キャンセル',
  'confirm.enable': 'Full access を有効にする',
} satisfies Record<PermissionSettingsKey, string>

/** Traditional Chinese dictionary for the current-session popup gate. */
export const accessZhTW = {
  'confirm.title': '確認啟用 Full access？',
  'confirm.description': '啟用 Full access 後，agent 將減少確認步驟，並且可以直接執行更多操作，包括敏感操作、檔案修改或外部指令。僅建議在你信任目前任務時使用。',
  'confirm.acknowledge': '我已了解風險，並願意繼續',
  'confirm.cancel': '取消',
  'confirm.enable': '啟用 Full access',
} satisfies Record<PermissionAccessKey, string>

/** Japanese dictionary for the current-session popup gate. */
export const accessJa = {
  'confirm.title': 'Full access を有効にしますか？',
  'confirm.description': 'Full access を有効にすると確認の手順が減り、エージェントは機密性の高い操作、ファイルの変更、外部コマンドなど、より多くの操作を直接実行できるようになります。現在のタスクを信頼できる場合にのみ使用してください。',
  'confirm.acknowledge': 'リスクを理解したうえで続行します',
  'confirm.cancel': 'キャンセル',
  'confirm.enable': 'Full access を有効にする',
} satisfies Record<PermissionAccessKey, string>
