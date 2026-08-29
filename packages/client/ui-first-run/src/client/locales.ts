/** Copy for the first-run tour. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  'title': 'What Rabi does',
  'skip': 'Skip',
  'back': 'Back',
  'next': 'Next',
  'done': 'Start using it',
  'step': 'Step {n} of {total}',
  'step.folder.title': 'Pick a folder first',
  'step.folder.body': 'Rabi only touches the folder you point it at. Pick one and it knows where to work.',
  'step.ask.title': 'Ask the way you would ask a person',
  'step.ask.body': 'No commands to remember and no syntax to learn. Write what you want the way you would tell a colleague.',
  'step.review.title': 'It shows you before it changes your files',
  'step.review.body': 'What it wants to change is laid out first — red is removed, green is added. It only writes once you say yes.',
  'step.machine.title': 'It can also work on another computer',
  'step.machine.body': 'Yours at home, one at the office, a rented one. Once it is set up, switching is one click.',
  'scene.hero': 'What can I do for you?',
  'scene.pick': 'Pick a folder',
  'scene.folders': 'Your folders',
  'scene.prompt': 'Tidy these invoices into one table',
  'scene.file': 'invoices.csv',
  'scene.no': 'Not yet',
  'scene.yes': 'Go ahead',
  'scene.done': 'Changed',
  'scene.here': 'This computer',
  'scene.there': 'The office one',
} as const

/** Simplified Chinese. */
export const zh: { [Key in keyof typeof en]: string } = {
  'title': 'Rabi 能做什么',
  'skip': '跳过',
  'back': '上一步',
  'next': '下一步',
  'done': '开始使用',
  'step': '第 {n} 步，共 {total} 步',
  'step.folder.title': '先挑一个文件夹',
  'step.folder.body': 'Rabi 只会动你指给它的那个文件夹。挑一个，它才知道要在哪里工作。',
  'step.ask.title': '用平常讲话的方式问',
  'step.ask.body': '不用记命令，也不用学语法。想要什么就写什么，写得像交代同事一样就可以。',
  'step.review.title': '动你的文件之前，先给你看',
  'step.review.body': '要改什么会先摊开来，红色是拿掉的、绿色是加上的。你说可以，它才动。',
  'step.machine.title': '也可以让它在另一台电脑上做',
  'step.machine.body': '家里的、公司的、租来的机器都行。设置好之后，切换就是按一下。',
  'scene.hero': '要我帮你做什么？',
  'scene.pick': '选一个文件夹',
  'scene.folders': '你的文件夹',
  'scene.prompt': '把这些发票整理成一张表',
  'scene.file': '发票.csv',
  'scene.no': '先不要',
  'scene.yes': '可以，改吧',
  'scene.done': '改好了',
  'scene.here': '这台电脑',
  'scene.there': '公司的机器',
}

/** Traditional Chinese. */
export const zhTW: { [Key in keyof typeof en]: string } = {
  'title': 'Rabi 能做什麼',
  'skip': '跳過',
  'back': '上一步',
  'next': '下一步',
  'done': '開始使用',
  'step': '第 {n} 步，共 {total} 步',
  'step.folder.title': '先挑一個資料夾',
  'step.folder.body': 'Rabi 只會動你指給它的那個資料夾。挑一個，它才知道要在哪裡工作。',
  'step.ask.title': '用平常講話的方式問',
  'step.ask.body': '不用記指令，也不用學語法。想要什麼就寫什麼，寫得像交代同事一樣就可以。',
  'step.review.title': '動你的檔案之前，先給你看',
  'step.review.body': '要改什麼會先攤開來，紅色是拿掉的、綠色是加上的。你說可以，它才動。',
  'step.machine.title': '也可以讓它在遠端機器上做',
  'step.machine.body': '家裡的、公司的、租來的機器都行。設定好之後，切換就是按一下。',
  'scene.hero': '要我幫你做什麼？',
  'scene.pick': '選一個資料夾',
  'scene.folders': '你的資料夾',
  'scene.prompt': '把這些發票整理成一張表',
  'scene.file': '發票.csv',
  'scene.no': '先不要',
  'scene.yes': '可以，改吧',
  'scene.done': '改好了',
  'scene.here': '這台電腦',
  'scene.there': '公司的機器',
}

/** Japanese. */
export const ja: { [Key in keyof typeof en]: string } = {
  'title': 'Rabi にできること',
  'skip': 'スキップ',
  'back': '戻る',
  'next': '次へ',
  'done': '使いはじめる',
  'step': '{total} ステップ中 {n}',
  'step.folder.title': 'まずフォルダーを選びます',
  'step.folder.body': 'Rabi は指定したフォルダーだけを扱います。選べば、どこで作業するか分かります。',
  'step.ask.title': '人に頼むように書けます',
  'step.ask.body': 'コマンドを覚える必要も、文法を学ぶ必要もありません。同僚に伝えるように書いてください。',
  'step.review.title': 'ファイルを変える前に見せます',
  'step.review.body': '何を変えるかを先に並べます。赤が削除、緑が追加です。承認してから書き込みます。',
  'step.machine.title': '別のパソコンで作業させることもできます',
  'step.machine.body': '自宅の、職場の、借りたマシンでも。設定すれば切り替えはワンクリックです。',
  'scene.hero': '何をしましょうか？',
  'scene.pick': 'フォルダーを選ぶ',
  'scene.folders': 'あなたのフォルダー',
  'scene.prompt': 'これらの請求書を一つの表にまとめて',
  'scene.file': '請求書.csv',
  'scene.no': 'まだやめておく',
  'scene.yes': '進めて',
  'scene.done': '変更しました',
  'scene.here': 'このパソコン',
  'scene.there': '職場のマシン',
}

/** Copy keys this plugin owns. */
export type FirstRunKey = keyof typeof en

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The first-run tour. */
    'first-run': FirstRunKey
  }
}
