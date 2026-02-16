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
  /** ders60mola15: kaçıncı ders bloğu (0-based), günlük sıfırlanır */
  dersCycle?: number
  /** ders60mola15: tur bilgisinin ait olduğu gün (YYYY-MM-DD) */
  dersCycleDate?: string | null
  /** ders60mola15: bu oturumda toplam mola süresi (ms) */
  molaToplamMs?: number
  /** deneme: bölümler arası mola süreleri (saniye) */
  denemeMolalarSaniye?: number[]
  /** deneme: bölüm arası moladayken mola başlangıç zamanı (ms). Doluysa “Mola – Devam” gösterilir. */
  denemeBreakStartTs?: number | null
  pauses: number
  lastTickTs: number | null
  /** Duraklatmanın başladığı zaman (performance.now()). Resume'da süre telafisi için kullanılır. */
  pauseStartTs?: number | null
  status: TimerStatus
  /** Erken bitirme ile mi bitti? (Scoring için: true = kısmi, false = tam tamamlandı) */
  wasEarlyFinish?: boolean
}

/** Seans başında isteğe bağlı ruh hali */
export type RuhHali = 'iyi' | 'normal' | 'yorucu'

/** Deneme seansı sonrası analiz: doğru / yanlış / boş (net = doğru - yanlış/4) */
export type DenemeAnaliz = { dogru: number; yanlis: number; bos: number }

export type SessionRecord = {
  id: string
  mod: Mode
  /** Planlanan süre (saniye) */
  surePlan?: number
  /** Gerçekleşen süre (saniye) */
  sureGercek: number
  puan: number
  tarihISO: string
  not?: string
  duraklatmaSayisi: number
  /** Erken bitirmede kalan süre (saniye) */
  erkenBitirmeSuresi?: number
  odakSkoru?: number
  /** ders60mola15: toplam mola süresi (saniye) */
  molaSaniye?: number
  /** deneme: bölümler arası mola süreleri (saniye) */
  denemeMolalarSaniye?: number[]
  /** deneme: analiz — doğru / yanlış / boş sayıları (net = doğru - yanlış/4) */
  dogruSayisi?: number
  yanlisSayisi?: number
  bosSayisi?: number
  bolumler?: { ad: string; surePlan?: number; sureGercek: number }[]
  platform?: { cihaz?: string; userAgentHash?: string }
  createdAt?: string
  updatedAt?: string
  ruhHali?: RuhHali
}
