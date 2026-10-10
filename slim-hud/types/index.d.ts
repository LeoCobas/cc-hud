export type GitStatus = {
  branch: string
  hasUpstream: boolean
  ahead: number
  behind: number
  changes: number
  conflicts: string[]
  /** Lines added / removed against HEAD, staged and unstaged. */
  added: number
  removed: number
}

export type Draft = {
  message: string
  /** Untracked files `add -A` staged, shown before confirming. */
  newFiles: string[]
}

export type Window = { percent: number; resetsAt: string | null }

/** What the bar shows besides git, refreshed on the engine's measurements. */
export type Info = {
  model: string
  effort: string | null
  folder: string
  contextPercent: number | null
  fiveHour: Window | null
  sevenDay: Window | null
  costUsd: number | null
  startedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'slim-hud': {
      git: GitStatus | null
      draft: Draft | null
      busy: string | null
      info: Info | null
      /** The last turn's effort; the setting stands in before the first one. */
      stepEffort: string | null
      /** Bumped by the clock so the reset countdowns move. */
      tick: number
    }
  }
}
