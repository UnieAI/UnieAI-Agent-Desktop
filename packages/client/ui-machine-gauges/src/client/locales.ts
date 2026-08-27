/** Copy for the machine gauges in the session header. */

/** English strings (the key-set source of truth for this pair). */
export const en = {
  'gauges.title': 'This machine',
  'gauges.open': 'What this machine is doing',
  'gauges.cpu': 'CPU',
  'gauges.memory': 'MEM',
  'gauges.disk': 'DISK',
  'gauges.gpu': 'GPU',
  'gauges.npu': 'NPU',
  'gauges.cores': 'Cores',
  'gauges.load': 'Load',
  'gauges.mount': 'Filesystem',
  'gauges.noAccelerator': 'No GPU or NPU reported this machine.',
  'gauges.stale': 'The last reading failed; these figures are from before it.',
}

/** Simplified Chinese. */
export const zh: { [Key in keyof typeof en]: string } = {
  'gauges.title': '这台机器',
  'gauges.open': '这台机器正在做什么',
  'gauges.cpu': 'CPU',
  'gauges.memory': '内存',
  'gauges.disk': '磁盘',
  'gauges.gpu': 'GPU',
  'gauges.npu': 'NPU',
  'gauges.cores': '核心数',
  'gauges.load': '负载',
  'gauges.mount': '文件系统',
  'gauges.noAccelerator': '这台机器没有报告 GPU 或 NPU。',
  'gauges.stale': '最近一次读取失败，这些是上一次的数字。',
}

/** Traditional Chinese. */
export const zhTW: { [Key in keyof typeof en]: string } = {
  'gauges.title': '這台機器',
  'gauges.open': '這台機器正在做什麼',
  'gauges.cpu': 'CPU',
  'gauges.memory': '記憶體',
  'gauges.disk': '磁碟',
  'gauges.gpu': 'GPU',
  'gauges.npu': 'NPU',
  'gauges.cores': '核心數',
  'gauges.load': '負載',
  'gauges.mount': '檔案系統',
  'gauges.noAccelerator': '這台機器沒有回報 GPU 或 NPU。',
  'gauges.stale': '最近一次讀取失敗，這些是上一次的數字。',
}

/** Japanese. */
export const ja: { [Key in keyof typeof en]: string } = {
  'gauges.title': 'このマシン',
  'gauges.open': 'このマシンの状態',
  'gauges.cpu': 'CPU',
  'gauges.memory': 'メモリ',
  'gauges.disk': 'ディスク',
  'gauges.gpu': 'GPU',
  'gauges.npu': 'NPU',
  'gauges.cores': 'コア数',
  'gauges.load': '負荷',
  'gauges.mount': 'ファイルシステム',
  'gauges.noAccelerator': 'このマシンは GPU も NPU も報告していません。',
  'gauges.stale': '直近の取得に失敗しました。以下は前回の値です。',
}

/** Copy keys this plugin owns. */
export type GaugesLocaleKey = keyof typeof en

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The machine gauges in the session header. */
    'conversation.gauges': GaugesLocaleKey
  }
}
