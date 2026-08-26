/** Copy dictionaries for the mascot's settings card. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  title: 'Desktop pet',
  show: 'Show',
  body: 'A small companion in the corner of the window. It reacts to what the agent is doing — thinking, running a tool, waiting for you — and does nothing else.',
}

/** Simplified Chinese. */
export const zh: { [Key in keyof typeof en]: string } = {
  title: '桌面宠物',
  show: '显示',
  body: '窗口角落里的一个小伙伴。它会跟着 agent 在做的事情变化——思考、执行工具、等你回应——除此之外不做任何事。',
}

/** Traditional Chinese. */
export const zhTW: { [Key in keyof typeof en]: string } = {
  title: '桌面寵物',
  show: '顯示',
  body: '視窗角落裡的一個小夥伴。它會跟著 agent 正在做的事情變化——思考、執行工具、等你回應——除此之外不做任何事。',
}

/** Japanese. */
export const ja: { [Key in keyof typeof en]: string } = {
  title: 'デスクトップペット',
  show: '表示',
  body: 'ウィンドウの隅にいる小さな相棒です。エージェントの状態——考えている、ツールを実行している、あなたを待っている——に合わせて動き、それ以外は何もしません。',
}

/** Copy keys this plugin owns. */
export type PetLocaleKey = keyof typeof en

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The mascot's settings card. */
    'settings.pet': PetLocaleKey
  }
}
