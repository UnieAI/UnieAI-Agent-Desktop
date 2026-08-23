/**
 * Notifications section copy.
 *
 * Wording is the UnieAI Copilot web product's, taken from its `AgentNext` and
 * `SettingsPage` message catalogs in all four shipped locales, so the desktop
 * app reads as the same product. Two deliberate departures, because the
 * desktop cannot do what the web product's strings promise:
 *
 * - `desktop.title` replaces the web product's "Push notifications" wording.
 *   There is no Web Push here (no service worker, no VAPID sender); what this
 *   section enables is the browser's own Notification permission.
 * - `desktop.desc` drops the web product's "or closed" clause for the same
 *   reason: nothing can notify you once this page is gone.
 *
 * The button and status lines come from the web product's push toggle, which
 * ships English only; the other three locales are adapted from the sentences
 * above rather than invented wholesale.
 */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  'nav': '通知',
  'title': '通知',

  'desktop.title': '桌面通知',
  'desktop.desc': '在此设备启用,任务在后台完成时也能收到通知。',
  'desktop.enable': '启用通知',
  'desktop.enabled': '此设备已启用通知。',
  'desktop.blocked': '通知权限已被封锁 — 请在浏览器设置中重新开启。',
  'desktop.unsupported': '此浏览器不支持通知。',

  'sound.title': '通知音效',
  'sound.desc': '后台任务完成时播放(此设备)。',
  'sound.pick': '选择通知音效',

  'complete.heading': '任务完成',
  'complete.body': '「{title}」完成了',
  'complete.untitled': '未命名对话',
} satisfies Record<string, string>

/** Notifications section locale key union. */
export type NotificationsLocaleKey = keyof typeof zh

/** Traditional Chinese dictionary. */
export const zhTW = {
  'nav': '通知',
  'title': '通知',

  'desktop.title': '桌面通知',
  'desktop.desc': '在此裝置啟用,任務在背景完成時也能收到通知。',
  'desktop.enable': '啟用通知',
  'desktop.enabled': '此裝置已啟用通知。',
  'desktop.blocked': '通知權限已被封鎖 — 請在瀏覽器設定中重新開啟。',
  'desktop.unsupported': '此瀏覽器不支援通知。',

  'sound.title': '通知音效',
  'sound.desc': '背景任務完成時播放(此裝置)。',
  'sound.pick': '選擇通知音效',

  'complete.heading': '任務完成',
  'complete.body': '「{title}」完成了',
  'complete.untitled': '未命名對話',
} satisfies Record<NotificationsLocaleKey, string>

/** Japanese dictionary. */
export const ja = {
  'nav': '通知',
  'title': '通知',

  'desktop.title': 'デスクトップ通知',
  'desktop.desc': 'この端末で有効にすると、アプリが背景でもタスク完了を通知します。',
  'desktop.enable': '通知を有効にする',
  'desktop.enabled': 'この端末では通知が有効です。',
  'desktop.blocked': '通知の許可がブロックされています — ブラウザの設定で再度許可してください。',
  'desktop.unsupported': 'このブラウザは通知に対応していません。',

  'sound.title': '通知音',
  'sound.desc': 'バックグラウンドのタスク完了時に再生(この端末)。',
  'sound.pick': '通知音を選ぶ',

  'complete.heading': 'タスク完了',
  'complete.body': '「{title}」が完了しました',
  'complete.untitled': '無題のチャット',
} satisfies Record<NotificationsLocaleKey, string>

/** English dictionary checked against the Chinese key set. */
export const en = {
  'nav': 'Notifications',
  'title': 'Notifications',

  'desktop.title': 'Desktop notifications',
  'desktop.desc': 'Enable on this device to get notified when a task finishes while the app is in the background.',
  'desktop.enable': 'Enable notifications',
  'desktop.enabled': 'Notifications are enabled on this device.',
  'desktop.blocked': 'Notification permission blocked — re-enable in browser settings.',
  'desktop.unsupported': 'Notifications are not supported in this browser.',

  'sound.title': 'Notification sound',
  'sound.desc': 'Plays when a background task finishes (this device).',
  'sound.pick': 'Choose a notification sound',

  'complete.heading': 'Task complete',
  'complete.body': '“{title}” finished',
  'complete.untitled': 'Untitled chat',
} satisfies Record<NotificationsLocaleKey, string>
