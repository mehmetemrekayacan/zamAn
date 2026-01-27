export type Mode = 'serbest' | 'gerisayim' | 'ders60mola15' | 'deneme'

export type Section = { ad: string; surePlanMs: number }

/** Ders/mola modlarında (ders60mola15) faz: çalışma veya mola */
export type WorkBreakPhase = 'work' | 'break'

export type ModeConfig =
  | { mode: 'serbest' }
  | { mode: 'gerisayim'; sureMs: number }
  | { mode: 'ders60mola15'; calismaMs: number; molaMs: number }
  | { mode: 'deneme'; bolumler: Section[]; currentSectionIndex?: number }

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'

export type TimerSnapshot = {
  running: boolean
  elapsedMs: number
  plannedMs?: number
  remainingMs?: number
  mode: Mode
  currentSectionIndex?: number
  /** ders60mola15: şu an ders mi mola mı */
  workBreakPhase?: WorkBreakPhase
  /** ders60mola15: kaçıncı ders bloğu (0-based) */
  dersCycle?: number
  /** ders60mola15: bu oturumda toplam mola süresi (ms) */
  molaToplamMs?: number
  /** deneme: bölümler arası mola süreleri (dakika) */
  denemeMolalarDakika?: number[]
  /** deneme: bölüm arası moladayken mola başlangıç zamanı (ms). Doluysa “Mola – Devam” gösterilir. */
  denemeBreakStartTs?: number | null
  pauses: number
  lastTickTs: number | null
  status: TimerStatus
}

/** Seans başında isteğe bağlı ruh hali */
export type RuhHali = 'iyi' | 'normal' | 'yorucu'

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
  molaDakika?: number
  denemeMolalarDakika?: number[]
  bolumler?: { ad: string; surePlan?: number; sureGercek: number }[]
  platform?: { cihaz?: string; userAgentHash?: string }
  createdAt?: string
  updatedAt?: string
  ruhHali?: RuhHali
}
