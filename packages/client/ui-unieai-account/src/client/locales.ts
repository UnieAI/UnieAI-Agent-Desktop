/**
 * Account copy, shared by the three settings sections this package registers
 * (Account, Regular usage limits, Invite friends) and by the sidebar's account
 * menu. The wording tracks the UnieAI web product's personal settings
 * (`Settings` / `SettingsPage` / `SettingsSubscription` / `InviteFriend` /
 * `SettingsUsageBilling` namespaces) so the desktop app reads as the same
 * product; the shipped Chinese locale here is `zh` (Simplified), matching
 * every other dictionary in this repository.
 *
 * The Usage and Invite navigation rows are labelled from `menu.usage` and
 * `menu.invite` rather than from nav keys of their own: the account menu row
 * and the settings-panel row open the SAME page, and one page named two ways
 * is how a reader ends up believing there are two.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'nav': '账户',
  'title': '账户',
  'intro': '更新您的名称与头像',

  'connect.eyebrow': '尚未连接',
  'connect.body': '登录 UnieAI 账号后，这里会显示你的个人资料、剩余用量与邀请记录。',
  'connect.action': '登录',
  'connect.unavailable': '此版本尚未内建 UnieAI 账号登录。桌面版接上账号服务后，你的资料与用量就会显示在这里。',
  'connect.failed': '连接失败',
  'connect.retry': '重试',

  'row.signedOut': '未登录',

  'menu.profile': '个人档案',
  'menu.usage': '剩余用量',
  'menu.invite': '邀请好友',
  'menu.lightMode': '浅色模式',
  'menu.darkMode': '深色模式',
  'menu.language': '语言',
  'menu.signOut': '登出',

  'stat.totalTokens': '累计 Token 数',
  'stat.peakTokens': 'Token 峰值',
  'stat.longestTask': '最长任务时间',
  'stat.currentStreak': '当前连续记录',
  'stat.longestStreak': '最长连续记录',

  'activity.title': 'Token 活动',
  'activity.daily': '每日',
  'activity.weekly': '每周',
  'activity.cumulative': '累计',
  'activity.cell': '{date}：{tokens} Token',
  'activity.empty': '过去一年没有任何 Token 活动记录。',

  'profile.email': '邮箱：{email}',
  'profile.managed': '名称与头像属于你的 UnieAI 账号，会同步到所有使用它的地方。',
  'profile.signOut': '登出',

  'profile.displayName': '显示名称',
  'profile.displayNameRequired': '显示名称为必填',
  'profile.editName': '编辑显示名称',
  'profile.save': '保存',
  'profile.saving': '保存中...',
  'profile.updated': '个人资料已更新',
  'profile.updateFailed': '更新失败，请稍后再试',
  'profile.changeAvatar': '更改头像',
  'profile.selectAvatar': '选择新头像',
  'profile.unsupportedImage': '不支持的图片格式。请使用 jpg/jpeg/png/gif/webp/heic/tif/tiff',
  'profile.readImageFailed': '读取图片失败',
  'profile.avatarUpdated': '头像已更新，请点击保存更改',
  'profile.avatarUpdatedGif': 'GIF 头像已更新，请点击保存更改',
  'profile.saveAvatarFailed': '保存头像失败',
  'profile.cancel': '取消',
  'profile.confirm': '确认',
  'profile.close': '关闭',

  'plan.title': '你的方案',

  'usage.title': '常规使用限额',
  'usage.intro': '每项限额还剩多少，以及何时重置。',
  'usage.remaining': '剩余 {pct}%',
  'usage.unlimited': '无限制',
  'usage.resetAt': '重置时间 {when}',
  'usage.resetEvery': '每 {hours} 小时重置 · 下次 {date}',
  'usage.empty': '此账号目前没有回报任何用量限额。',

  'invite.title': '邀请好友',
  'invite.body': '当你的好友加入并发送第一条消息后，你就会获得 1 次速率限制重置，可随时使用',
  'invite.reward': '1 次速率限制重置 / 每次邀请',
  'invite.credits': '可用的速率限制重置：{count}',
  'invite.sentCount': '已邀请 {count} 人',
  'invite.noneSent': '尚未发送任何邀请。',
  'invite.empty': '此账号目前没有回报任何邀请信息。',
  'invite.emailPlaceholder': '添加电子邮件',
  'invite.send': '发送',
  'invite.sending': '发送中…',
  'invite.sentBody': '邀请已发送，好友加入后你将获得奖励。',
  'invite.errorToast': '邀请发送失败',
  'invite.errorInvalidEmail': '电子邮件格式不正确。',
  'invite.errorSelfInvite': '不能邀请自己。',
  'invite.errorAlreadyInvited': '你已经邀请过这个邮箱了。',
  'invite.unsupported': '此桌面版暂时无法发送邀请。',
  'invite.copy': '复制链接',
  'invite.copied': '已复制',
  'invite.copyFailed': '复制失败',

  'general.hint': '外观（浅色／深色）与语言在「通用设置」中调整。',
} satisfies Record<string, string>

/** The account namespace key union. */
export type AccountKey = keyof typeof zh

// Declared here rather than in the plugin entry: every component in this
// package imports `AccountKey` from this module, so the merge is guaranteed
// to be in any program that types the `t` seat — including the component
// specs, which never load the entry.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Account settings section's copy. */
    'settings.account': AccountKey
  }
}

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'Account',
  'title': 'Account',
  'intro': 'Update your name and avatar',

  'connect.eyebrow': 'Not connected',
  'connect.body': 'Sign in to your UnieAI account to see your profile, remaining usage, and invites here.',
  'connect.action': 'Sign in',
  'connect.unavailable': 'This build does not ship UnieAI account sign-in yet. Once the desktop account service is connected, your profile and usage appear here.',
  'connect.failed': 'Connection failed',
  'connect.retry': 'Try again',

  'row.signedOut': 'Not signed in',

  'menu.profile': 'Profile',
  'menu.usage': 'Usage',
  'menu.invite': 'Invite friends',
  'menu.lightMode': 'Light mode',
  'menu.darkMode': 'Dark mode',
  'menu.language': 'Language',
  'menu.signOut': 'Sign out',

  'stat.totalTokens': 'Total Tokens',
  'stat.peakTokens': 'Peak Tokens',
  'stat.longestTask': 'Longest Task',
  'stat.currentStreak': 'Current Streak',
  'stat.longestStreak': 'Longest Streak',

  'activity.title': 'Token Activity',
  'activity.daily': 'Daily',
  'activity.weekly': 'Weekly',
  'activity.cumulative': 'Cumulative',
  'activity.cell': '{date}: {tokens} tokens',
  'activity.empty': 'No token activity reported for the past year.',

  'profile.email': 'Email: {email}',
  'profile.managed': 'Your name and avatar belong to your UnieAI account and change everywhere you use it.',
  'profile.signOut': 'Sign out',

  'profile.displayName': 'Display Name',
  'profile.displayNameRequired': 'Display name is required',
  'profile.editName': 'Edit display name',
  'profile.save': 'Save',
  'profile.saving': 'Saving...',
  'profile.updated': 'Profile updated',
  'profile.updateFailed': 'Update failed, please try again',
  'profile.changeAvatar': 'Change Avatar',
  'profile.selectAvatar': 'Select New Avatar',
  'profile.unsupportedImage': 'Unsupported image format. Please use jpg/jpeg/png/gif/webp/heic/tif/tiff',
  'profile.readImageFailed': 'Failed to read image',
  'profile.avatarUpdated': 'Avatar updated, please save changes',
  'profile.avatarUpdatedGif': 'GIF avatar updated, please save changes',
  'profile.saveAvatarFailed': 'Failed to save avatar',
  'profile.cancel': 'Cancel',
  'profile.confirm': 'Confirm',
  'profile.close': 'Close',

  'plan.title': 'Your plan',

  'usage.title': 'Regular usage limits',
  'usage.intro': 'How much of each allowance is left, and when it resets.',
  'usage.remaining': '{pct}% remaining',
  'usage.unlimited': 'Unlimited',
  'usage.resetAt': 'Resets at {when}',
  'usage.resetEvery': 'Resets every {hours} hours · Next {date}',
  'usage.empty': 'This account reports no usage limits right now.',

  'invite.title': 'Invite a friend',
  'invite.body': "When your friend joins and sends their first message, you'll get 1 rate-limit reset to use anytime.",
  'invite.reward': '1 rate-limit reset / per invite',
  'invite.credits': 'Rate-limit resets available: {count}',
  'invite.sentCount': '{count} invited',
  'invite.noneSent': 'No invites sent yet.',
  'invite.empty': 'This account reports no invites right now.',
  'invite.emailPlaceholder': 'Add email',
  'invite.send': 'Send',
  'invite.sending': 'Sending…',
  'invite.sentBody': "Invite sent — you'll earn your reward once your friend joins.",
  'invite.errorToast': "Couldn't send invite",
  'invite.errorInvalidEmail': 'That email address looks invalid.',
  'invite.errorSelfInvite': "You can't invite yourself.",
  'invite.errorAlreadyInvited': "You've already invited this email.",
  'invite.unsupported': 'This desktop cannot send invites yet.',
  'invite.copy': 'Copy link',
  'invite.copied': 'Copied',
  'invite.copyFailed': "Couldn't copy",

  'general.hint': 'Appearance (light / dark) and language live in General settings.',
} satisfies Record<AccountKey, string>

/**
 * The product-published copy in the two locales this package's own
 * dictionaries do not otherwise cover, taken verbatim from the UnieAI web
 * product's `AgentNext`, `Settings`, `SettingsPage`, `SettingsSubscription`
 * and `InviteFriend` messages rather than translated here — plus the handful
 * of lines this section had to write itself (an invite balance, an empty
 * heatmap, a cell's tooltip), which are authored in all four locales because
 * the product publishes no equivalent to copy.
 *
 * They are deliberately PARTIAL. Locale lookup falls back per key to the
 * English dictionary, so registering only the keys that are actually settled
 * gives a zh-TW or ja reader the product's own wording where it exists while
 * every other key keeps resolving exactly as it does today. The alternative —
 * a complete dictionary — would mean inventing translations for the keys the
 * product never published.
 */
export const partialZhTW: Partial<Record<AccountKey, string>> = {
  'intro': '更新你的名稱與頭像',

  'menu.profile': '個人檔案',
  'menu.usage': '剩餘用量',
  'menu.invite': '邀請好友',
  'menu.lightMode': '淺色模式',
  'menu.darkMode': '深色模式',
  'menu.language': '語言',
  'menu.signOut': '登出',

  'stat.totalTokens': '累計 Token 數',
  'stat.peakTokens': 'Token 峰值',
  'stat.longestTask': '最長任務時間',
  'stat.currentStreak': '目前連續紀錄',
  'stat.longestStreak': '最長連續記錄',

  'activity.title': 'Token 活動',
  'activity.daily': '每日',
  'activity.weekly': '每週',
  'activity.cumulative': '累計',
  'activity.cell': '{date}：{tokens} Token',
  'activity.empty': '過去一年沒有任何 Token 活動紀錄。',

  'profile.displayName': '顯示名稱',
  'profile.displayNameRequired': '顯示名稱為必填',
  'profile.editName': '編輯顯示名稱',
  'profile.save': '儲存',
  'profile.saving': '儲存中...',
  'profile.updated': '個人資料已更新',
  'profile.updateFailed': '更新失敗，請稍後再試',
  'profile.changeAvatar': '更改頭像',
  'profile.selectAvatar': '選擇新頭像',
  'profile.unsupportedImage': '不支援的圖片格式。請使用 jpg/jpeg/png/gif/webp/heic/tif/tiff',
  'profile.readImageFailed': '讀取圖片失敗',
  'profile.avatarUpdated': '頭像已更新，請按下儲存變更保存更改',
  'profile.avatarUpdatedGif': 'GIF 頭像已更新，請按下儲存變更保存更改',
  'profile.saveAvatarFailed': '儲存頭像失敗',
  'profile.cancel': '取消',
  'profile.confirm': '確認',
  'profile.close': '關閉',

  'usage.title': '常規使用限額',
  'usage.intro': '每項限額還剩多少，以及何時重置。',
  'usage.resetEvery': '每 {hours} 小時重置 · 下次 {date}',

  'invite.title': '邀請好友',
  'invite.body': '當你的朋友加入並傳送第一則訊息後，你就會獲得 1 次速率限制重置，可隨時使用',
  'invite.reward': '1 次速率限制重設 / 每次邀請',
  'invite.credits': '可用的速率限制重設：{count}',
  'invite.sentCount': '已邀請 {count} 人',
  'invite.noneSent': '尚未送出任何邀請。',
  'invite.empty': '此帳號目前沒有回報任何邀請資訊。',
  'invite.emailPlaceholder': '新增電子郵件',
  'invite.send': '傳送',
  'invite.sending': '傳送中…',
  'invite.sentBody': '邀請已送出，朋友加入後你將獲得獎勵。',
  'invite.errorToast': '邀請寄送失敗',
  'invite.errorInvalidEmail': '電子郵件格式不正確。',
  'invite.errorSelfInvite': '不能邀請自己。',
  'invite.errorAlreadyInvited': '你已經邀請過這個信箱了。',
  'invite.unsupported': '此桌面版暫時無法傳送邀請。',
}

/** Japanese half of the same partial copy. */
export const partialJa: Partial<Record<AccountKey, string>> = {
  'intro': '名前とアバターを更新します',

  'menu.profile': 'プロフィール',
  'menu.usage': '残り使用量',
  'menu.invite': '友達を招待',
  'menu.lightMode': 'ライトモード',
  'menu.darkMode': 'ダークモード',
  'menu.language': '言語',
  'menu.signOut': 'ログアウト',

  'stat.totalTokens': '累計トークン数',
  'stat.peakTokens': 'トークンのピーク',
  'stat.longestTask': '最長タスク時間',
  'stat.currentStreak': '現在の連続記録',
  'stat.longestStreak': '最長の連続記録',

  'activity.title': 'トークンアクティビティ',
  'activity.daily': '日次',
  'activity.weekly': '週次',
  'activity.cumulative': '累計',
  'activity.cell': '{date}：{tokens} トークン',
  'activity.empty': '過去 1 年間のトークンアクティビティはありません。',

  'profile.displayName': '表示名',
  'profile.displayNameRequired': '表示名は必須です',
  'profile.editName': '表示名を編集',
  'profile.save': '保存',
  'profile.saving': '保存中...',
  'profile.updated': 'プロフィールを更新しました',
  'profile.updateFailed': '更新に失敗しました。後でもう一度お試しください',
  'profile.changeAvatar': 'アバターを変更',
  'profile.selectAvatar': '新しいアバターを選択',
  'profile.unsupportedImage': 'サポートされていない画像形式です。jpg/jpeg/png/gif/webp/heic/tif/tiff をご使用ください',
  'profile.readImageFailed': '画像の読み込みに失敗しました',
  'profile.avatarUpdated': 'アバターを更新しました。変更を保存するには「変更を保存」をクリックしてください',
  'profile.avatarUpdatedGif': 'GIF アバターを更新しました。変更を保存するには「変更を保存」をクリックしてください',
  'profile.saveAvatarFailed': 'アバターの保存に失敗しました',
  'profile.cancel': 'キャンセル',
  'profile.confirm': '確認',
  'profile.close': '閉じる',

  'usage.title': '通常の使用上限',
  'usage.intro': '各利用枠の残量と、リセットのタイミング。',
  'usage.resetEvery': '{hours} 時間ごとにリセット · 次回 {date}',

  'invite.title': '友達を招待',
  'invite.body': '友達が参加して最初のメッセージを送信すると、いつでも使えるレート制限リセットを 1 回獲得できます。',
  'invite.reward': 'レート制限リセット 1 回 / 招待ごと',
  'invite.credits': '利用可能なレート制限リセット：{count}',
  'invite.sentCount': '{count} 人を招待済み',
  'invite.noneSent': 'まだ招待を送信していません。',
  'invite.empty': 'このアカウントは現在、招待情報を返していません。',
  'invite.emailPlaceholder': 'メールアドレスを追加',
  'invite.send': '送信',
  'invite.sending': '送信中…',
  'invite.sentBody': '招待を送信しました。友達が参加すると報酬を獲得できます。',
  'invite.errorToast': '招待を送信できませんでした',
  'invite.errorInvalidEmail': 'メールアドレスの形式が正しくありません。',
  'invite.errorSelfInvite': '自分自身は招待できません。',
  'invite.errorAlreadyInvited': 'このメールアドレスはすでに招待済みです。',
  'invite.unsupported': 'このデスクトップではまだ招待を送信できません。',
}

/**
 * Traditional Chinese copy.
 *
 * The lines the web product publishes are the ones `partialZhTW` carries
 * verbatim, and they are kept exactly. The rest are this package's own words —
 * states the product's page cannot be in — and translating OUR copy is not
 * inventing the product's, which is why they are here rather than falling back
 * to English and leaving the page half translated.
 */
export const zhTW = {
  'nav': '帳戶',
  'title': '帳戶',
  'intro': '更新你的名稱與頭像',
  'connect.eyebrow': '尚未連接',
  'connect.body': '登入 UnieAI 帳號後，這裡會顯示你的個人資料、剩餘用量與邀請紀錄。',
  'connect.action': '登入',
  'connect.unavailable': '此版本尚未內建 UnieAI 帳號登入。桌面版接上帳號服務後，你的資料與用量就會顯示在這裡。',
  'connect.failed': '連接失敗',
  'connect.retry': '重試',
  'row.signedOut': '未登入',
  'menu.profile': '個人檔案',
  'menu.usage': '剩餘用量',
  'menu.invite': '邀請好友',
  'menu.lightMode': '淺色模式',
  'menu.darkMode': '深色模式',
  'menu.language': '語言',
  'menu.signOut': '登出',
  'stat.totalTokens': '累計 Token 數',
  'stat.peakTokens': 'Token 峰值',
  'stat.longestTask': '最長任務時間',
  'stat.currentStreak': '目前連續紀錄',
  'stat.longestStreak': '最長連續記錄',
  'activity.title': 'Token 活動',
  'activity.daily': '每日',
  'activity.weekly': '每週',
  'activity.cumulative': '累計',
  'activity.cell': '{date}：{tokens} Token',
  'activity.empty': '過去一年沒有任何 Token 活動紀錄。',
  'profile.email': '電子郵件：{email}',
  'profile.managed': '名稱與大頭貼屬於你的 UnieAI 帳號，會同步到所有使用它的地方。',
  'profile.signOut': '登出',
  'profile.displayName': '顯示名稱',
  'profile.displayNameRequired': '顯示名稱為必填',
  'profile.editName': '編輯顯示名稱',
  'profile.save': '儲存',
  'profile.saving': '儲存中...',
  'profile.updated': '個人資料已更新',
  'profile.updateFailed': '更新失敗，請稍後再試',
  'profile.changeAvatar': '更改頭像',
  'profile.selectAvatar': '選擇新頭像',
  'profile.unsupportedImage': '不支援的圖片格式。請使用 jpg/jpeg/png/gif/webp/heic/tif/tiff',
  'profile.readImageFailed': '讀取圖片失敗',
  'profile.avatarUpdated': '頭像已更新，請按下儲存變更保存更改',
  'profile.avatarUpdatedGif': 'GIF 頭像已更新，請按下儲存變更保存更改',
  'profile.saveAvatarFailed': '儲存頭像失敗',
  'profile.cancel': '取消',
  'profile.confirm': '確認',
  'profile.close': '關閉',
  'plan.title': '你的方案',
  'usage.title': '常規使用限額',
  'usage.intro': '每項限額還剩多少，以及何時重置。',
  'usage.remaining': '剩餘 {pct}%',
  'usage.unlimited': '無限制',
  'usage.resetAt': '重置時間 {when}',
  'usage.resetEvery': '每 {hours} 小時重置 · 下次 {date}',
  'usage.empty': '此帳號目前沒有回報任何用量額度。',
  'invite.title': '邀請好友',
  'invite.body': '當你的朋友加入並傳送第一則訊息後，你就會獲得 1 次速率限制重置，可隨時使用',
  'invite.reward': '1 次速率限制重設 / 每次邀請',
  'invite.credits': '可用的速率限制重設：{count}',
  'invite.sentCount': '已邀請 {count} 人',
  'invite.noneSent': '尚未送出任何邀請。',
  'invite.empty': '此帳號目前沒有回報任何邀請資訊。',
  'invite.emailPlaceholder': '新增電子郵件',
  'invite.send': '傳送',
  'invite.sending': '傳送中…',
  'invite.sentBody': '邀請已送出，朋友加入後你將獲得獎勵。',
  'invite.errorToast': '邀請寄送失敗',
  'invite.errorInvalidEmail': '電子郵件格式不正確。',
  'invite.errorSelfInvite': '不能邀請自己。',
  'invite.errorAlreadyInvited': '你已經邀請過這個信箱了。',
  'invite.unsupported': '此桌面版暫時無法傳送邀請。',
  'invite.copy': '複製連結',
  'invite.copied': '已複製',
  'invite.copyFailed': '複製失敗',
  'general.hint': '外觀（淺色／深色）與語言在「一般設定」中調整。',
} satisfies Record<AccountKey, string>

/** Japanese copy, on the same terms as {@link zhTW}. */
export const ja = {
  'nav': 'アカウント',
  'title': 'アカウント',
  'intro': '名前とアバターを更新します',
  'connect.eyebrow': '未接続',
  'connect.body': 'UnieAI アカウントにサインインすると、プロフィール、残りの使用量、招待の記録がここに表示されます。',
  'connect.action': 'サインイン',
  'connect.unavailable': 'このビルドには UnieAI アカウントのサインインがまだ含まれていません。デスクトップ版がアカウントサービスに接続すると、プロフィールと使用量がここに表示されます。',
  'connect.failed': '接続に失敗しました',
  'connect.retry': '再試行',
  'row.signedOut': '未サインイン',
  'menu.profile': 'プロフィール',
  'menu.usage': '残り使用量',
  'menu.invite': '友達を招待',
  'menu.lightMode': 'ライトモード',
  'menu.darkMode': 'ダークモード',
  'menu.language': '言語',
  'menu.signOut': 'ログアウト',
  'stat.totalTokens': '累計トークン数',
  'stat.peakTokens': 'トークンのピーク',
  'stat.longestTask': '最長タスク時間',
  'stat.currentStreak': '現在の連続記録',
  'stat.longestStreak': '最長の連続記録',
  'activity.title': 'トークンアクティビティ',
  'activity.daily': '日次',
  'activity.weekly': '週次',
  'activity.cumulative': '累計',
  'activity.cell': '{date}：{tokens} トークン',
  'activity.empty': '過去 1 年間のトークンアクティビティはありません。',
  'profile.email': 'メール：{email}',
  'profile.managed': '名前とアイコンは UnieAI アカウントのもので、それを使うすべての場所に同期されます。',
  'profile.signOut': 'サインアウト',
  'profile.displayName': '表示名',
  'profile.displayNameRequired': '表示名は必須です',
  'profile.editName': '表示名を編集',
  'profile.save': '保存',
  'profile.saving': '保存中...',
  'profile.updated': 'プロフィールを更新しました',
  'profile.updateFailed': '更新に失敗しました。後でもう一度お試しください',
  'profile.changeAvatar': 'アバターを変更',
  'profile.selectAvatar': '新しいアバターを選択',
  'profile.unsupportedImage': 'サポートされていない画像形式です。jpg/jpeg/png/gif/webp/heic/tif/tiff をご使用ください',
  'profile.readImageFailed': '画像の読み込みに失敗しました',
  'profile.avatarUpdated': 'アバターを更新しました。変更を保存するには「変更を保存」をクリックしてください',
  'profile.avatarUpdatedGif': 'GIF アバターを更新しました。変更を保存するには「変更を保存」をクリックしてください',
  'profile.saveAvatarFailed': 'アバターの保存に失敗しました',
  'profile.cancel': 'キャンセル',
  'profile.confirm': '確認',
  'profile.close': '閉じる',
  'plan.title': 'ご利用のプラン',
  'usage.title': '通常の使用上限',
  'usage.intro': '各利用枠の残量と、リセットのタイミング。',
  'usage.remaining': '残り {pct}%',
  'usage.unlimited': '無制限',
  'usage.resetAt': 'リセット {when}',
  'usage.resetEvery': '{hours} 時間ごとにリセット · 次回 {date}',
  'usage.empty': 'このアカウントは利用上限を報告していません。',
  'invite.title': '友達を招待',
  'invite.body': '友達が参加して最初のメッセージを送信すると、いつでも使えるレート制限リセットを 1 回獲得できます。',
  'invite.reward': 'レート制限リセット 1 回 / 招待ごと',
  'invite.credits': '利用可能なレート制限リセット：{count}',
  'invite.sentCount': '{count} 人を招待済み',
  'invite.noneSent': 'まだ招待を送信していません。',
  'invite.empty': 'このアカウントは現在、招待情報を返していません。',
  'invite.emailPlaceholder': 'メールアドレスを追加',
  'invite.send': '送信',
  'invite.sending': '送信中…',
  'invite.sentBody': '招待を送信しました。友達が参加すると報酬を獲得できます。',
  'invite.errorToast': '招待を送信できませんでした',
  'invite.errorInvalidEmail': 'メールアドレスの形式が正しくありません。',
  'invite.errorSelfInvite': '自分自身は招待できません。',
  'invite.errorAlreadyInvited': 'このメールアドレスはすでに招待済みです。',
  'invite.unsupported': 'このデスクトップではまだ招待を送信できません。',
  'invite.copy': 'リンクをコピー',
  'invite.copied': 'コピーしました',
  'invite.copyFailed': 'コピーに失敗しました',
  'general.hint': '外観（ライト／ダーク）と言語は「一般設定」で変更します。',
} satisfies Record<AccountKey, string>
