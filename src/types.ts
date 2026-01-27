export type Mode = 'serbest' | 'gerisayim' | 'pomodoro' | 'deneme'

export type Section = { ad: string; surePlanMs: number }

export type PomodoroPhase = 'work' | 'break'

export type ModeConfig =
  | { mode: 'serbest' }
  | { mode: 'gerisayim'; sureMs: number }
  | { mode: 'pomodoro'; calismaMs: number; dinlenmeMs: number; dongu: number }
  | { mode: 'deneme'; bolumler: Section[]; currentSectionIndex?: number }

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'

export type TimerSnapshot = {
  running: boolean
  elapsedMs: number
  plannedMs?: number
  remainingMs?: number
  mode: Mode
  currentSectionIndex?: number
  pomodoroPhase?: PomodoroPhase
  pomodoroCycle?: number
  pauses: number
  lastTickTs: number | null
  status: TimerStatus
}

export type SessionRecord = {
  id: string
  mod: Mode
  surePlan?: number
  sureGercek: number
  puan: number
  tarihISO: string
  not?: string
  duraklatmaSayisi: number
  erkenBitirmeSuresi?: number
  odakSkoru?: number
  bolumler?: { ad: string; surePlan?: number; sureGercek: number }[]
  platform?: { cihaz?: string; userAgentHash?: string }
  createdAt?: string
  updatedAt?: string
}
