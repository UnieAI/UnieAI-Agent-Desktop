/**
 * API Provider section copy.
 *
 * Every key whose text the UnieAI Copilot web product already publishes is
 * copied VERBATIM from `messages/{en,zh-tw,zh-cn,ja}.json`'s `Settings`
 * namespace — the source keys are named beside each line. That is not a
 * stylistic preference: this section shows the same rows as that product's
 * "API Provider Settings" page, and a paraphrase would make one list look like
 * two features.
 *
 * `API URL` and `API Key` are literals in the reference's own markup, in every
 * locale, so they are literals here too. The remaining keys — the ones below
 * the divider in each dictionary — are this package's own words, and they are
 * of two sorts: states the web page cannot be in (no session, an unreachable
 * host, a list that is still loading), and the two managed-row explanations
 * that the product publishes ONLY as hard-coded Traditional Chinese inside
 * `app/api/user/providers/[id]/route.ts` (`managedNoDelete`, `error.managed`).
 * The zh-TW lines of those two are that route's own text, character for
 * character; the other three locales are translations of it, because there is
 * no published original to copy.
 *
 * Three keys deliberately DIVERGE from the reference, each one a case where
 * copying verbatim would state something this build cannot honour:
 *
 *   - `nav` is the settings column's row label, not the page heading. The
 *     reference publishes no separate nav string, and
 *     `apiProviderSettingsTitle` is twenty characters against a 176px column,
 *     so it rendered as `API Provider Setti…`. The words are still the
 *     reference's own — the name it gives the page where it enumerates it in
 *     `SettingsPage.description`: `API Providers` in English, `API Provider`
 *     elsewhere. `title` carries the heading verbatim, unchanged.
 *   - `managed` is a state badge, not a name. The reference's badge text is
 *     the words `UnieAI Studio`, and on this desktop it sits beside a provider
 *     whose display name is ALSO `UnieAI Studio` — a badge repeating the row's
 *     own name carries nothing and competes with the routing prefix next to
 *     it. It says what being managed means instead, in the one-word shape the
 *     `disabled` badge sharing its slot already uses.
 *   - `managedHint` and `emptyHint` drop the reference's `Sync models`
 *     sentence. No such control exists here and none can: the projection this
 *     page reads reports model IDS rather than the catalogue objects carrying
 *     the modality flags, so `modelList` is refused as
 *     `model_list_unsupported` and a round trip could only write the catalogue
 *     back flattened. Copy that teaches a button which is not on the screen is
 *     worse than a paraphrase.
 *
 * All four shipped locales carry a complete dictionary, so nothing here falls
 * back to English.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  // SettingsPage.description enumerates the page as `API Provider`; see the note above.
  'nav': 'API Provider',
  // Settings.apiProviderSettingsTitle
  'title': 'API Provider 设置',
  // Settings.apiProviderSettingsDesc
  'intro': '管理您的 OpenAI 兼容 Provider，并选择要开放给聊天使用的模型。',
  // Settings.addProvider
  'add': '添加 Provider',
  // Settings.noProvidersYet
  'empty': '尚未配置任何 Provider',
  // Settings.noProvidersHint, minus the sync half — see the note above.
  'emptyHint': '请先添加一个 Provider。',
  // Settings.unnamedProvider
  'unnamed': '未命名 Provider',
  // Settings.apiUrlNotSet
  'urlUnset': '未设置 API URL',
  // Settings.disabledBadge
  'disabled': '已停用',
  // NOT Settings.managedByStudioBadge — see the note above.
  'managed': '托管',
  // Settings.managedByStudioHint, minus the sync half.
  'managedHint': '由已绑定的 UnieAI Studio 账号同步而来。连接地址与凭证均自动管理，你可以在下方选择要启用哪些模型。',
  // Settings.modelsSelectedInfo
  'models': '已选 {selected}/{total} 个模型',
  // Settings.displayName
  'form.name': '显示名称',
  // Settings.displayNamePlaceholder
  'form.namePlaceholder': '例如：OpenAI',
  // Settings.prefixLabel
  'form.prefix': 'Prefix（4位英数字，唯一标识）',
  // Settings.prefixPlaceholder
  'form.prefixPlaceholder': '例如：OAI1',
  'form.url': 'API URL',
  'form.urlPlaceholder': 'https://api.openai.com/v1',
  'form.key': 'API Key',
  // Settings.enterApiKey
  'form.keyPlaceholder': '请输入 API Key',
  // Settings.createProvider
  'form.submit': '创建 Provider',
  // Settings.creating
  'form.submitting': '创建中...',
  // Settings.cancel
  'form.cancel': '取消',
  // Settings.providerCreated
  'created': 'Provider 已创建',
  // Settings.displayNameRequired
  'error.name': '显示名称为必填',
  // Settings.prefixRequired
  'error.prefixRequired': 'Prefix 为必填',
  // Settings.prefixFormat
  'error.prefixFormat': 'Prefix 需为 4 位英数字',
  // Settings.prefixExists
  'error.prefixExists': 'Prefix 已存在',
  // Settings.fillApiUrlKey
  'error.fields': '请填写 API URL / API Key',
  // Settings.saveFailed
  'error.failed': '保存失败',
  // Settings.edit
  'edit': '编辑',
  // Settings.save
  'save': '保存',
  // Settings.saving
  'saving': '保存中...',
  // Settings.savedProvider
  'saved': 'Provider 已保存',
  // Settings.deleteProviderTitle
  'delete': '删除 Provider',
  // Settings.confirmDeleteProvider
  'confirmDelete': '确定删除 Provider「{name}」？',
  // Settings.providerDeleted
  'deleted': 'Provider 已删除',
  // Settings.deleteFailed
  'error.deleteFailed': '删除失败',
  // Settings.enableProvider
  'form.enabled': '启用 Provider',
  // Settings.selectModelsLabel
  'form.models': '选择模型（已选 {selected}/{total} 个）',
  // Settings.selectAll
  'form.selectAll': '全选',
  // Settings.clearAll
  'form.clearAll': '清空',

  // ── this package's own words (see the module note) ────────────────────────
  'loading': '正在读取 Provider…',
  'signedOut': '登录 UnieAI 账号后，这里会显示该账号的 Provider。',
  'unreadable': '无法读取 UnieAI Provider。',
  'retry': '重试',
  'error.url': 'API URL 需为 http 或 https 网址',
  'error.limit': '目前方案的 Provider 数量已达上限。',
  'error.notFound': '找不到此 Provider，可能已在别处被删除。',
  'deleting': '删除中...',
  'deleteWarning': '删除后，此 Provider 提供的模型会一并消失。',
  'form.keyKeep': '留空则保留原本的 API Key',
  'form.noModels': '目前没有可选的模型。',
  'managedEditable': '此 Provider 由 UnieAI Studio 管理，这里只能调整启用状态与要开放的模型。',
  'managedNoDelete': '此 Provider 由 UnieAI Studio 绑定同步管理，请至设定解除绑定。',
  'error.managed': '此 Provider 由 UnieAI Studio 绑定同步管理，仅能调整模型启用状态。',
} satisfies Record<string, string>

/** The provider namespace key union. */
export type ProvidersKey = keyof typeof zh

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The API Provider settings section's copy. */
    'settings.providers': ProvidersKey
  }
}

/** Traditional Chinese dictionary, checked complete against the zh key set. */
export const zhTW = {
  'nav': 'API Provider',
  'title': 'API Provider 設定',
  'intro': '管理你的 OpenAI 相容 Provider，並選擇要開放給聊天使用的模型。',
  'add': '新增 Provider',
  'empty': '尚未設定任何 Provider',
  'emptyHint': '請先新增一個 Provider。',
  'unnamed': '未命名 Provider',
  'urlUnset': '未設定 API URL',
  'disabled': '已停用',
  'managed': '託管',
  'managedHint': '由已綁定的 UnieAI Studio 帳號同步而來。連線位址與憑證皆自動管理，你可以在下方選擇要啟用哪些模型。',
  'models': '已選 {selected}/{total} 模型',
  'form.name': '顯示名稱',
  'form.namePlaceholder': '例如：OpenAI',
  'form.prefix': 'Prefix（4碼英數字，唯一識別）',
  'form.prefixPlaceholder': '例如：OAI1',
  'form.url': 'API URL',
  'form.urlPlaceholder': 'https://api.openai.com/v1',
  'form.key': 'API Key',
  'form.keyPlaceholder': '請輸入 API Key',
  'form.submit': '建立 Provider',
  'form.submitting': '建立中...',
  'form.cancel': '取消',
  'created': 'Provider 已建立',
  'error.name': '顯示名稱為必填',
  'error.prefixRequired': 'Prefix 為必填',
  'error.prefixFormat': 'Prefix 需為 4 碼英數字',
  'error.prefixExists': 'Prefix 已存在',
  'error.fields': '請填寫 API URL / API Key',
  'error.failed': '儲存失敗',
  'edit': '編輯',
  'save': '儲存',
  'saving': '儲存中...',
  'saved': 'Provider 已儲存',
  'delete': '刪除 Provider',
  'confirmDelete': '確定刪除 Provider「{name}」？',
  'deleted': 'Provider 已刪除',
  'error.deleteFailed': '刪除失敗',
  'form.enabled': '啟用 Provider',
  'form.models': '選擇模型（已選 {selected}/{total} 個）',
  'form.selectAll': '全選',
  'form.clearAll': '清空',

  'loading': '正在讀取 Provider…',
  'signedOut': '登入 UnieAI 帳號後，這裡會顯示該帳號的 Provider。',
  'unreadable': '無法讀取 UnieAI Provider。',
  'retry': '重試',
  'error.url': 'API URL 需為 http 或 https 網址',
  'error.limit': '目前方案的 Provider 數量已達上限。',
  'error.notFound': '找不到此 Provider，可能已在其他地方被刪除。',
  'deleting': '刪除中...',
  'deleteWarning': '刪除後，此 Provider 提供的模型會一併消失。',
  'form.keyKeep': '留空則保留原本的 API Key',
  'form.noModels': '目前沒有可選的模型。',
  'managedEditable': '此 Provider 由 UnieAI Studio 管理，這裡只能調整啟用狀態與要開放的模型。',
  'managedNoDelete': '此 Provider 由 UnieAI Studio 綁定同步管理，請至設定解除綁定。',
  'error.managed': '此 Provider 由 UnieAI Studio 綁定同步管理，僅能調整模型啟用狀態。',
} satisfies Record<ProvidersKey, string>

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'nav': 'API Providers',
  'title': 'API Provider Settings',
  'intro': 'Manage your OpenAI-compatible Providers and select models to enable for chat.',
  'add': 'Add Provider',
  'empty': 'No Providers configured',
  'emptyHint': 'Please add a Provider.',
  'unnamed': 'Unnamed Provider',
  'urlUnset': 'API URL not set',
  'disabled': 'Disabled',
  'managed': 'Managed',
  'managedHint': 'Synced from your linked UnieAI Studio account. The endpoint and credential are managed for you — choose which models to enable below.',
  'models': '{selected}/{total} models selected',
  'form.name': 'Display Name',
  'form.namePlaceholder': 'e.g. OpenAI',
  'form.prefix': 'Prefix (4 alphanumeric chars, unique ID)',
  'form.prefixPlaceholder': 'e.g. OAI1',
  'form.url': 'API URL',
  'form.urlPlaceholder': 'https://api.openai.com/v1',
  'form.key': 'API Key',
  'form.keyPlaceholder': 'Enter API Key',
  'form.submit': 'Create Provider',
  'form.submitting': 'Creating...',
  'form.cancel': 'Cancel',
  'created': 'Provider created',
  'error.name': 'Display name is required',
  'error.prefixRequired': 'Prefix is required',
  'error.prefixFormat': 'Prefix must be 4 alphanumeric characters',
  'error.prefixExists': 'Prefix already exists',
  'error.fields': 'Please fill in API URL / API Key',
  'error.failed': 'Save failed',
  'edit': 'Edit',
  'save': 'Save',
  'saving': 'Saving...',
  'saved': 'Provider saved',
  'delete': 'Delete Provider',
  'confirmDelete': 'Are you sure you want to delete Provider "{name}"?',
  'deleted': 'Provider deleted',
  'error.deleteFailed': 'Delete failed',
  'form.enabled': 'Enable Provider',
  'form.models': 'Select Models ({selected}/{total})',
  'form.selectAll': 'Select All',
  'form.clearAll': 'Clear All',

  'loading': 'Reading your Providers…',
  'signedOut': 'Sign in to your UnieAI account to see its Providers here.',
  'unreadable': 'The UnieAI Providers could not be read.',
  'retry': 'Retry',
  'error.url': 'API URL must be an http or https address',
  'error.limit': 'Your plan has reached its Provider limit.',
  'error.notFound': 'This Provider no longer exists; it may have been deleted elsewhere.',
  'deleting': 'Deleting...',
  'deleteWarning': 'Deleting it takes the models it offers with it.',
  'form.keyKeep': 'Leave blank to keep the stored API Key',
  'form.noModels': 'No models to choose from yet.',
  'managedEditable': 'This Provider is managed by UnieAI Studio; only its enabled state and which models it offers can be changed here.',
  'managedNoDelete': 'This Provider is synced from a linked UnieAI Studio account. Unlink the account in settings to remove it.',
  'error.managed': 'This Provider is synced from a linked UnieAI Studio account; only the model selection can be changed.',
} satisfies Record<ProvidersKey, string>

/** Japanese dictionary, checked complete against the zh key set. */
export const ja = {
  'nav': 'API Provider',
  'title': 'API Provider 設定',
  'intro': 'OpenAI 互換の Provider を管理し、チャットで使用するモデルを選択します。',
  'add': 'Provider を追加',
  'empty': 'Provider が設定されていません',
  'emptyHint': 'Provider を追加してください。',
  'unnamed': '無名の Provider',
  'urlUnset': 'API URL が設定されていません',
  'disabled': '無効',
  'managed': '自動管理',
  'managedHint': '連携済みの UnieAI Studio アカウントから同期されています。エンドポイントと認証情報は自動管理されます。下で有効にするモデルを選んでください。',
  'models': '{selected}/{total} 個のモデルを選択',
  'form.name': '表示名',
  'form.namePlaceholder': '例: OpenAI',
  'form.prefix': 'Prefix（4 桁英数字、一意の識別子）',
  'form.prefixPlaceholder': '例: OAI1',
  'form.url': 'API URL',
  'form.urlPlaceholder': 'https://api.openai.com/v1',
  'form.key': 'API Key',
  'form.keyPlaceholder': 'API Key を入力',
  'form.submit': 'Provider を作成',
  'form.submitting': '作成中...',
  'form.cancel': 'キャンセル',
  'created': 'Provider を作成しました',
  'error.name': '表示名は必須です',
  'error.prefixRequired': 'Prefix は必須です',
  'error.prefixFormat': 'Prefix は 4 桁の英数字である必要があります',
  'error.prefixExists': 'Prefix は既に存在します',
  'error.fields': 'API URL / API Key を入力してください',
  'error.failed': '保存に失敗しました',
  'edit': '編集',
  'save': '保存',
  'saving': '保存中...',
  'saved': 'Provider を保存しました',
  'delete': 'Provider を削除',
  'confirmDelete': 'Provider「{name}」を削除してもよろしいですか？',
  'deleted': 'Provider を削除しました',
  'error.deleteFailed': '削除に失敗しました',
  'form.enabled': 'Provider を有効にする',
  'form.models': 'モデルを選択（{selected}/{total}）',
  'form.selectAll': 'すべて選択',
  'form.clearAll': 'すべてクリア',

  'loading': 'Provider を読み込んでいます…',
  'signedOut': 'UnieAI アカウントにサインインすると、そのアカウントの Provider が表示されます。',
  'unreadable': 'UnieAI の Provider を読み取れませんでした。',
  'retry': '再試行',
  'error.url': 'API URL は http または https のアドレスである必要があります',
  'error.limit': '現在のプランの Provider 数が上限に達しています。',
  'error.notFound': 'この Provider は見つかりません。ほかの場所で削除された可能性があります。',
  'deleting': '削除中...',
  'deleteWarning': '削除すると、この Provider が提供するモデルも一緒になくなります。',
  'form.keyKeep': '空欄のままにすると、保存済みの API Key を維持します',
  'form.noModels': '選択できるモデルがありません。',
  'managedEditable': 'この Provider は UnieAI Studio が管理しています。ここで変更できるのは有効状態と提供するモデルだけです。',
  'managedNoDelete': 'この Provider は連携済みの UnieAI Studio アカウントから同期されています。削除するには設定で連携を解除してください。',
  'error.managed': 'この Provider は連携済みの UnieAI Studio アカウントから同期されています。変更できるのはモデルの選択のみです。',
} satisfies Record<ProvidersKey, string>
