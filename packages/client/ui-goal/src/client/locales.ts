/** `goal` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'phase.active': '进行中的目标',
  'phase.paused': '已暂停的目标',
  'phase.blocked': '受阻的目标',
  'objective.aria': '目标内容',
  'commandInput.aria': '命令输入',
  'action.save': '保存目标',
  'action.cancel': '取消编辑',
  'action.pause': '暂停目标',
  'action.resume': '恢复目标',
  'action.edit': '编辑目标',
  'action.clear': '清除目标',
} satisfies Record<string, string>

/** The goal namespace key union. */
export type GoalKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'phase.active': 'Ongoing Goal',
  'phase.paused': 'Paused Goal',
  'phase.blocked': 'Blocked Goal',
  'objective.aria': 'Goal objective',
  'commandInput.aria': 'Command input',
  'action.save': 'Save goal',
  'action.cancel': 'Cancel edit',
  'action.pause': 'Pause goal',
  'action.resume': 'Resume goal',
  'action.edit': 'Edit goal',
  'action.clear': 'Clear goal',
} satisfies Record<GoalKey, string>

/** Traditional Chinese dictionary, checked complete against the zh key set. */
export const zhTW = {
  'phase.active': '進行中的目標',
  'phase.paused': '已暫停的目標',
  'phase.blocked': '受阻的目標',
  'objective.aria': '目標內容',
  'commandInput.aria': '指令輸入',
  'action.save': '儲存目標',
  'action.cancel': '取消編輯',
  'action.pause': '暫停目標',
  'action.resume': '恢復目標',
  'action.edit': '編輯目標',
  'action.clear': '清除目標',
} satisfies Record<GoalKey, string>

/** Japanese dictionary, checked complete against the zh key set. */
export const ja = {
  'phase.active': '進行中のゴール',
  'phase.paused': '一時停止中のゴール',
  'phase.blocked': 'ブロック中のゴール',
  'objective.aria': 'ゴールの内容',
  'commandInput.aria': 'コマンド入力',
  'action.save': 'ゴールを保存',
  'action.cancel': '編集をキャンセル',
  'action.pause': 'ゴールを一時停止',
  'action.resume': 'ゴールを再開',
  'action.edit': 'ゴールを編集',
  'action.clear': 'ゴールをクリア',
} satisfies Record<GoalKey, string>
