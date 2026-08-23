/** `trajectory` namespace dictionaries (view tab label + toolbar strings). */

/** Dictionary namespace owned by this plugin. */
export const NS = 'trajectory'

/** The trajectory dictionary key set (the source of truth for both locales). */
export type TrajectoryKey =
  | 'view.trajectory'
  | 'toolbar.aria'
  | 'toolbar.duration'
  | 'toolbar.useActualDuration'
  | 'toolbar.useEqualWidth'
  | 'toolbar.actualTime'
  | 'toolbar.turns'
  | 'toolbar.expandTurns'
  | 'toolbar.collapseTurns'
  | 'toolbar.calls'
  | 'toolbar.expandCalls'
  | 'toolbar.collapseCalls'
  | 'toolbar.search'
  | 'toolbar.searchPlaceholder'

declare module '@unieai/uad-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The trajectory view tab label and toolbar strings. */
    'trajectory': TrajectoryKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<TrajectoryKey, string> = {
  'view.trajectory': '轨迹',
  'toolbar.aria': '轨迹工具栏',
  'toolbar.duration': 'Duration',
  'toolbar.useActualDuration': 'Use actual duration',
  'toolbar.useEqualWidth': 'Use equal-width operations',
  'toolbar.actualTime': '实际时间',
  'toolbar.turns': 'Turns',
  'toolbar.expandTurns': 'Expand turns',
  'toolbar.collapseTurns': 'Collapse turns',
  'toolbar.calls': 'Calls',
  'toolbar.expandCalls': 'Expand calls',
  'toolbar.collapseCalls': 'Collapse calls',
  'toolbar.search': '搜索轨迹',
  'toolbar.searchPlaceholder': '搜索',
}

/** English dictionary. */
export const en: Record<TrajectoryKey, string> = {
  'view.trajectory': 'Trajectory',
  'toolbar.aria': 'Trajectory toolbar',
  'toolbar.duration': 'Duration',
  'toolbar.useActualDuration': 'Use actual duration',
  'toolbar.useEqualWidth': 'Use equal-width operations',
  'toolbar.actualTime': 'Actual time',
  'toolbar.turns': 'Turns',
  'toolbar.expandTurns': 'Expand turns',
  'toolbar.collapseTurns': 'Collapse turns',
  'toolbar.calls': 'Calls',
  'toolbar.expandCalls': 'Expand calls',
  'toolbar.collapseCalls': 'Collapse calls',
  'toolbar.search': 'Search trajectory',
  'toolbar.searchPlaceholder': 'Search',
}

/** Traditional Chinese dictionary. */
export const zhTW: Record<TrajectoryKey, string> = {
  'view.trajectory': '軌跡',
  'toolbar.aria': '軌跡工具列',
  'toolbar.duration': '時長',
  'toolbar.useActualDuration': '使用實際時長',
  'toolbar.useEqualWidth': '操作等寬顯示',
  'toolbar.actualTime': '實際時間',
  'toolbar.turns': '回合',
  'toolbar.expandTurns': '展開回合',
  'toolbar.collapseTurns': '收合回合',
  'toolbar.calls': '呼叫',
  'toolbar.expandCalls': '展開呼叫',
  'toolbar.collapseCalls': '收合呼叫',
  'toolbar.search': '搜尋軌跡',
  'toolbar.searchPlaceholder': '搜尋',
}

/** Japanese dictionary. */
export const ja: Record<TrajectoryKey, string> = {
  'view.trajectory': '軌跡',
  'toolbar.aria': '軌跡ツールバー',
  'toolbar.duration': '所要時間',
  'toolbar.useActualDuration': '実際の所要時間を使用',
  'toolbar.useEqualWidth': '操作を等幅で表示',
  'toolbar.actualTime': '実時間',
  'toolbar.turns': 'ターン',
  'toolbar.expandTurns': 'ターンを展開',
  'toolbar.collapseTurns': 'ターンを折りたたむ',
  'toolbar.calls': '呼び出し',
  'toolbar.expandCalls': '呼び出しを展開',
  'toolbar.collapseCalls': '呼び出しを折りたたむ',
  'toolbar.search': '軌跡を検索',
  'toolbar.searchPlaceholder': '検索',
}
