import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getLocalDateString } from '../lib/time'
import type { Mode, ModeConfig, Section, WorkBreakPhase, TimerSnapshot, TimerStatus } from '../types'
import { TIMER_STRATEGIES } from '../lib/timerStrategies'

// Test için: 10 sn ders, 5 sn mola (normal: 60*60*1000, 15*60*1000)
// ders60mola15: 60 dakika ders, 15 dakika mola


const DERS_MS = 60 * 60 * 1000
const MOLA_MS = 15 * 60 * 1000

const DERS60_PAUSE_STORAGE_KEY = 'zaman-ders60-pause-state'

export const MODE_DEFAULTS: Record<Mode, ModeConfig> = {
  serbest: { mode: 'serbest' },
  gerisayim: { mode: 'gerisayim', sureMs: 40 * 60 * 1000 },
  EXAM_SIMULATOR: { mode: 'EXAM_SIMULATOR', startTimeHHmm: '14:45', sureMs: 90 * 60 * 1000 },
  ders60mola15: { mode: 'ders60mola15', calismaMs: DERS_MS, molaMs: MOLA_MS },
  deneme: {
    mode: 'deneme',
    templateId: 'oabt-ags',
    templateName: 'ÖABT + AGS',
    bolumler: [
      { ad: 'AGS', surePlanMs: 110 * 60 * 1000 },
      { ad: 'ÖABT', surePlanMs: 90 * 60 * 1000 },
    ],
    currentSectionIndex: 0,
  },
}

/** Deneme şablonları — iki ana başlık: KPSS (Genel Yetenek 60 + Genel Kültür 60), ÖABT+AGS. */
export const DENEME_TEMPLATES: { id: string; label: string; bolumler: Section[] }[] = [
  {
    id: 'kpss',
    label: 'KPSS',
    bolumler: [
      { ad: 'Genel Yetenek', surePlanMs: 60 * 60 * 1000 },
      { ad: 'Genel Kültür', surePlanMs: 60 * 60 * 1000 },
    ],
  },
  {
    id: 'oabt-ags',
    label: 'ÖABT + AGS',
    bolumler: [
      { ad: 'AGS', surePlanMs: 110 * 60 * 1000 },
      { ad: 'ÖABT', surePlanMs: 90 * 60 * 1000 },
    ],
  },
]

const getPlannedMs = (config: ModeConfig, phase: WorkBreakPhase = 'work', currentSectionIndex = 0): number | undefined => {
  const strategy = TIMER_STRATEGIES[config.mode]
  return strategy ? strategy.getPlannedMs(config, phase, currentSectionIndex) : undefined
}

function deriveDers6015PhaseAndPlan(
  config: ModeConfig,
  state: { modeConfig?: ModeConfig; workBreakPhase?: WorkBreakPhase; dersCycleDate?: string | null; currentSectionIndex?: number },
  today: string,
  forcedPhase?: WorkBreakPhase,
): { phase: WorkBreakPhase; plannedMs: number | undefined } {
  const isDersMode = config.mode === 'ders60mola15'
  const phase: WorkBreakPhase = forcedPhase
    ?? (isDersMode && state.dersCycleDate === today && state.modeConfig?.mode === 'ders60mola15'
      ? (state.workBreakPhase ?? 'work')
      : 'work')

  return {
    phase,
    plannedMs: getPlannedMs(config, phase, state.currentSectionIndex ?? 0),
  }
}

function getPomodoroStateForToday(
  state: { pomodoroRound?: number; lastPomodoroDate?: string | null },
  today: string,
): { pomodoroRound: number; lastPomodoroDate: string } {
  const currentRound = Math.max(1, state.pomodoroRound ?? 1)
  if (!state.lastPomodoroDate || state.lastPomodoroDate !== today) {
    return { pomodoroRound: 1, lastPomodoroDate: today }
  }
  return { pomodoroRound: currentRound, lastPomodoroDate: state.lastPomodoroDate }
}

/* ═══════════════════════════════════════
   Web Worker Entegrasyonu
   ═══════════════════════════════════════ */

let worker: Worker | null = null

/**
 * Worker'ı lazy olarak başlatır. Vite, `new URL(...)` ile
 * modülü ayrı bundle edip doğru yolu üretir.
 * Node.js test ortamında Worker yoktur — no-op olarak çalışır.
 */
function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (!worker) {
    worker = new Worker(new URL('../lib/timerWorker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

function startWorker(onTick: () => void): void {
  const w = getWorker()
  if (!w) return // Node.js test ortamı — Worker yok
  w.onmessage = (e: MessageEvent) => {
    if (e.data === 'tick') {
      onTick()
    }
  }
  w.postMessage('start')
}

function stopWorker(): void {
  if (worker) {
    worker.postMessage('stop')
    worker.onmessage = null
  }
}

/* ═══════════════════════════════════════
   Tick / Zaman Hesaplama (Absolute Time)
   ═══════════════════════════════════════ */

type TimerCoreState = TimerSnapshot & {
  modeConfig: ModeConfig
  pomodoroRound: number
  lastPomodoroDate: string
}

type GetState = () => TimerCoreState
type SetState = (partial: Partial<TimerCoreState>) => void

function processTick(get: GetState, set: SetState): void {
  const state = get()
  if (state.status !== 'running') return

  const now = Date.now()
  const strategy = TIMER_STRATEGIES[state.mode]
  if (!strategy) return

  const tickUpdates = strategy.onTick(now, state)
  const { finished, ...updates } = tickUpdates

  set(updates)

  if (finished) {
    stopWorker()
  }
}

export type TimerState = TimerSnapshot & {
  modeConfig: ModeConfig
  pomodoroRound: number
  lastPomodoroDate: string
  start: (config?: ModeConfig) => void
  pause: () => void
  resume: () => void
  reset: () => void
  setModeConfig: (config: ModeConfig) => void
  jumpToSection: (index: number) => void
  /** Deneme modunda bölüm arası moladan sonraki bölüme geçer, mola süresini kaydeder */
  advanceFromDenemeBreak: () => void
  /** Herhangi bir vakitte erken bitir; o ana kadar geçen süreyi kaydetmek için status'u finished yapar */
  finishEarly: () => void
  getRemainingMs: () => number | undefined
  /** Sekme tekrar görünür olduğunda çağrılır; mutlak zaman üzerinden UI'ı anında günceller */
  syncOnVisibilityChange: () => void
  /** Alias: syncOnVisibilityChange ile aynı, visibility API fallback için */
  syncTimer: () => void
  /** ders60mola15: FinishScreen kapatıldıktan sonra arka plandaki molaya geçiş yapar */
  transitionToBreak: () => void
  /** ders60mola15: Mola sırasında erken bitirip sonraki tura geçer */
  finishBreakEarly: () => void
  /** Persist edilen runtime bilgileriyle yarım kalan seansı hesaplayıp günceller */
  recoverSession: () => void
  /** Kurtarılan seansı iptal edip timer'ı idle'a çeker */
  discardRecoveredSession: () => void
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      running: false,
      status: 'idle',
      elapsedMs: 0,
      plannedMs: undefined,
      remainingMs: undefined,
      mode: MODE_DEFAULTS.serbest.mode,
      modeConfig: MODE_DEFAULTS.serbest,
      currentSectionIndex: 0,
      workBreakPhase: 'work',
      dersCycle: 0,
      dersCycleDate: null,
      molaToplamMs: 0,
      denemeMolalarSaniye: [],
      denemeBreakStartTs: null,
      pauses: 0,
      lastTickTs: null,
      pauseStartTs: null,
      wasEarlyFinish: undefined,
      totalPauseDurationMs: 0,
      backgroundBreakStartTs: null,
      backgroundBreakPlannedMs: undefined,
      expectedEndTime: undefined,
      startWallTime: undefined,
      isOvertime: false,
      pomodoroRound: 1,
      lastPomodoroDate: getLocalDateString(),

      setModeConfig: (config) => {
        stopWorker()
        const state = get()
        const bugun = getLocalDateString()
        const pomodoroState = getPomodoroStateForToday(state, bugun)
        const denemeRawIdx = config.mode === 'deneme' ? config.currentSectionIndex ?? 0 : 0
        const sectionIdx = config.mode === 'deneme'
          ? Math.max(0, Math.min(denemeRawIdx, Math.max(0, config.bolumler.length - 1)))
          : 0
        const normalizedConfig: ModeConfig = config.mode === 'deneme'
          ? { ...config, currentSectionIndex: sectionIdx }
          : config
        const plannedMs = getPlannedMs(normalizedConfig, 'work', sectionIdx)
        const currentSectionIndex = normalizedConfig.mode === 'deneme' ? sectionIdx : undefined

        if (state.mode === 'ders60mola15' && state.modeConfig.mode === 'ders60mola15' && normalizedConfig.mode !== 'ders60mola15') {
          if ((state.status === 'paused' || state.status === 'running') && state.dersCycleDate === bugun) {
            try {
              localStorage.setItem(DERS60_PAUSE_STORAGE_KEY, JSON.stringify({
                elapsedMs: state.elapsedMs,
                remainingMs: state.remainingMs,
                plannedMs: state.plannedMs,
                workBreakPhase: state.workBreakPhase ?? 'work',
                status: state.status,
                pauses: state.pauses,
                dersCycle: state.dersCycle ?? 0,
                molaToplamMs: state.molaToplamMs ?? 0,
                savedAt: bugun,
              }))
            } catch { /* ignore */ }
          }
        }

        let workBreakPhase: WorkBreakPhase | undefined = normalizedConfig.mode === 'ders60mola15' ? 'work' : undefined
        let dersCycle: number | undefined = normalizedConfig.mode === 'ders60mola15' ? Math.max(0, pomodoroState.pomodoroRound - 1) : undefined
        let molaToplamMs: number | undefined = normalizedConfig.mode === 'ders60mola15' ? 0 : undefined
        let dersCycleDate: string | null = normalizedConfig.mode === 'ders60mola15' ? bugun : null
        let elapsedMs = 0
        let restoredPlannedMs = plannedMs
        let restoredRemainingMs = plannedMs
        let status: TimerStatus = 'idle'
        let restoredPauses = 0

        if (normalizedConfig.mode === 'ders60mola15') {
          if (state.dersCycleDate === bugun) {
            workBreakPhase = state.workBreakPhase ?? 'work'
            dersCycle = state.dersCycle ?? 0
            molaToplamMs = state.molaToplamMs ?? 0
            dersCycleDate = bugun
          }
          try {
            const saved = localStorage.getItem(DERS60_PAUSE_STORAGE_KEY)
            if (saved) {
              const parsed = JSON.parse(saved) as { elapsedMs?: number; remainingMs?: number; plannedMs?: number; workBreakPhase?: WorkBreakPhase; status?: TimerStatus; pauses?: number; dersCycle?: number; molaToplamMs?: number; savedAt?: string }
              if (parsed.savedAt === bugun && parsed.elapsedMs != null && parsed.plannedMs != null) {
                elapsedMs = parsed.elapsedMs
                restoredPlannedMs = parsed.plannedMs
                restoredRemainingMs = parsed.remainingMs ?? Math.max(0, parsed.plannedMs - parsed.elapsedMs)
                workBreakPhase = (parsed.workBreakPhase ?? 'work') as WorkBreakPhase
                status = (parsed.status === 'paused' ? 'paused' : 'idle') as TimerStatus
                restoredPauses = parsed.pauses ?? 0
                dersCycle = parsed.dersCycle ?? dersCycle ?? 0
                molaToplamMs = parsed.molaToplamMs ?? molaToplamMs ?? 0
                dersCycleDate = bugun
                localStorage.removeItem(DERS60_PAUSE_STORAGE_KEY)
              }
            }
          } catch { /* ignore */ }
        }

        const updates: Partial<TimerCoreState> = {
          modeConfig: normalizedConfig,
          mode: normalizedConfig.mode,
          plannedMs: elapsedMs > 0 ? restoredPlannedMs : plannedMs,
          remainingMs: elapsedMs > 0 ? restoredRemainingMs : plannedMs,
          elapsedMs,
          status,
          running: false,
          pauses: elapsedMs > 0 ? restoredPauses : 0,
          lastTickTs: null,
          expectedEndTime: undefined,
          startWallTime: undefined,
          currentSectionIndex,
          denemeBreakStartTs: null,
          pomodoroRound: pomodoroState.pomodoroRound,
          lastPomodoroDate: pomodoroState.lastPomodoroDate,
        }
        if (normalizedConfig.mode === 'ders60mola15') {
          updates.workBreakPhase = workBreakPhase
          updates.dersCycle = dersCycle
          updates.molaToplamMs = molaToplamMs
          updates.dersCycleDate = dersCycleDate
        }
        set(updates)
      },

      advanceFromDenemeBreak: () => {
        const state = get()
        if (state.modeConfig.mode !== 'deneme' || state.denemeBreakStartTs == null) return
        const breakSeconds = Math.round((Date.now() - state.denemeBreakStartTs) / 1000)
        const molalar = [...(state.denemeMolalarSaniye ?? []), breakSeconds]
        const nextIdx = (state.currentSectionIndex ?? 0) + 1
        const plannedNext = getPlannedMs(state.modeConfig, 'work', nextIdx)
        const updatedConfig = { ...state.modeConfig, currentSectionIndex: nextIdx }
        const now = Date.now()
        set({
          modeConfig: updatedConfig,
          currentSectionIndex: nextIdx,
          denemeMolalarSaniye: molalar,
          denemeBreakStartTs: null,
          elapsedMs: 0,
          plannedMs: plannedNext,
          remainingMs: plannedNext,
          lastTickTs: now,
          expectedEndTime: plannedNext != null ? now + plannedNext : undefined,
          startWallTime: now,
          status: 'running',
          running: true,
        })
        startWorker(() => processTick(get as GetState, set))
      },

      start: (config) => {
        const state = get()
        const cfg = config ?? state.modeConfig ?? MODE_DEFAULTS.serbest
        const bugun = getLocalDateString()
        const pomodoroState = getPomodoroStateForToday(state, bugun)
        const strategy = TIMER_STRATEGIES[cfg.mode]
        stopWorker()

        const startUpdates = strategy
          ? strategy.onStart(cfg, state, bugun, pomodoroState.pomodoroRound)
          : {}

        set({
          modeConfig: cfg,
          mode: cfg.mode,
          pomodoroRound: pomodoroState.pomodoroRound,
          lastPomodoroDate: pomodoroState.lastPomodoroDate,
          ...startUpdates,
        })

        startWorker(() => processTick(get as GetState, set))
      },

      pause: () => {
        const state = get()
        if (state.status !== 'running') return
        const strategy = TIMER_STRATEGIES[state.mode]
        if (strategy && !strategy.canPause(state)) return
        
        stopWorker()
        const now = Date.now()
        const pauseUpdates = strategy ? strategy.onPause(now, state) : {}

        set(pauseUpdates)
      },

      resume: () => {
        const state = get()
        if (state.status !== 'paused') return
        const now = Date.now()
        const pauseStartTs = state.pauseStartTs ?? now
        const pauseDurationMs = now - pauseStartTs
        const strategy = TIMER_STRATEGIES[state.mode]
        const resumeUpdates = strategy ? strategy.onResume(now, state, pauseDurationMs) : {}

        set(resumeUpdates)

        startWorker(() => processTick(get as GetState, set))
      },

      reset: () => {
        const state = get()
        const bugun = getLocalDateString()
        const pomodoroState = getPomodoroStateForToday(state, bugun)
        const strategy = TIMER_STRATEGIES[state.mode]
        stopWorker()

        const resetUpdates = strategy ? strategy.onReset(state, bugun, pomodoroState.pomodoroRound) : {}

        set({
          pomodoroRound: pomodoroState.pomodoroRound,
          lastPomodoroDate: pomodoroState.lastPomodoroDate,
          ...resetUpdates,
        })
      },

      jumpToSection: (index) => {
        const state = get()
        if (state.modeConfig.mode !== 'deneme') return
        const clamped = Math.max(0, Math.min(index, state.modeConfig.bolumler.length - 1))
        const updatedConfig = { ...state.modeConfig, currentSectionIndex: clamped }
        const plannedMs = getPlannedMs(updatedConfig)
        stopWorker()
        set({
          modeConfig: updatedConfig,
          mode: 'deneme',
          currentSectionIndex: clamped,
          status: 'idle',
          running: false,
          elapsedMs: 0,
          plannedMs,
          remainingMs: plannedMs,
          lastTickTs: null,
          expectedEndTime: undefined,
          startWallTime: undefined,
          pauses: 0,
          denemeBreakStartTs: null,
        })
      },

      finishEarly: () => {
        const state = get()
        if (state.status !== 'running' && state.status !== 'paused') return
        stopWorker()
        const now = Date.now()

        // Mutlak zamandan geçen süreyi hesapla
        let finalElapsed: number
        if (state.isOvertime && (state.mode === 'deneme' || state.mode === 'ders60mola15' || state.mode === 'gerisayim')) {
          finalElapsed = state.elapsedMs
        } else if (state.status === 'running') {
          if (state.plannedMs != null && state.expectedEndTime != null) {
            const remaining = Math.max(0, state.expectedEndTime - now)
            finalElapsed = state.plannedMs - remaining
          } else {
            finalElapsed = state.startWallTime != null ? now - state.startWallTime : state.elapsedMs
          }
        } else {
          finalElapsed = state.elapsedMs
        }

        // Eğer paused durumdaysa, son pause süresini de totalPauseDurationMs'e ekle
        let totalPause = state.totalPauseDurationMs ?? 0
        if (state.status === 'paused' && state.pauseStartTs) {
          totalPause += now - state.pauseStartTs
        }

        const bugun = getLocalDateString()
        const pomodoroState = getPomodoroStateForToday(state, bugun)
        const strategy = TIMER_STRATEGIES[state.mode]

        const finishUpdates = strategy
          ? strategy.onFinishEarly(now, state, totalPause, finalElapsed, bugun, pomodoroState.pomodoroRound)
          : {}

        set(finishUpdates)
      },

      getRemainingMs: () => get().remainingMs,

      /**
       * ders60mola15: FinishScreen kapatıldıktan sonra arka plandaki molaya geçiş.
       */
      transitionToBreak: () => {
        const state = get()
        if (state.backgroundBreakStartTs == null || state.backgroundBreakPlannedMs == null) return

        const now = Date.now()
        const breakElapsed = now - state.backgroundBreakStartTs
        const breakRemaining = Math.max(0, state.backgroundBreakPlannedMs - breakElapsed)
        const bugun = getLocalDateString()

        if (breakRemaining <= 0) {
          const { plannedMs: nextWorkPlannedMs } = deriveDers6015PhaseAndPlan(
            state.modeConfig,
            state,
            bugun,
            'work',
          )
          // Mola zaten bitmiş — direkt sonraki çalışma turuna geç
          set({
            status: 'idle',
            running: false,
            elapsedMs: 0,
            plannedMs: nextWorkPlannedMs,
            remainingMs: nextWorkPlannedMs,
            lastTickTs: null,
            expectedEndTime: undefined,
            startWallTime: undefined,
            workBreakPhase: 'work',
            backgroundBreakStartTs: null,
            backgroundBreakPlannedMs: undefined,
            totalPauseDurationMs: 0,
            pauseStartTs: null,
            pauses: 0,
            molaToplamMs: (state.molaToplamMs ?? 0) + (state.backgroundBreakPlannedMs ?? 0),
            dersCycleDate: bugun,
          })
          return
        }

        // Mola hâlâ devam ediyor — kalan süreyle break countdown başlat
        stopWorker()
        const expectedEnd = now + breakRemaining
        set({
          workBreakPhase: 'break',
          status: 'running',
          running: true,
          elapsedMs: breakElapsed,
          plannedMs: state.backgroundBreakPlannedMs,
          remainingMs: breakRemaining,
          lastTickTs: now,
          expectedEndTime: expectedEnd,
          startWallTime: undefined,
          backgroundBreakStartTs: null,
          backgroundBreakPlannedMs: undefined,
          totalPauseDurationMs: 0,
          pauseStartTs: null,
          pauses: 0,
        })

        startWorker(() => processTick(get as GetState, set))
      },

      /**
       * ders60mola15: Mola sırasında "Molayı Bitir / Sonraki Tur" butonu.
       */
      finishBreakEarly: () => {
        const state = get()
        if (state.mode !== 'ders60mola15') return
        if (state.workBreakPhase !== 'break' && state.backgroundBreakStartTs == null) return

        stopWorker()
        const bugun = getLocalDateString()
        const { plannedMs: nextWorkPlannedMs } = deriveDers6015PhaseAndPlan(
          state.modeConfig,
          state,
          bugun,
          'work',
        )
        const now = Date.now()
        const rawBreak = state.backgroundBreakStartTs != null
          ? now - state.backgroundBreakStartTs
          : state.elapsedMs ?? 0
        const plannedBreak = state.backgroundBreakPlannedMs
          ?? (state.modeConfig.mode === 'ders60mola15' ? state.modeConfig.molaMs : MOLA_MS)
        const breakMola = Math.max(0, Math.min(rawBreak, plannedBreak))

        set({
          status: 'idle',
          running: false,
          elapsedMs: 0,
          plannedMs: nextWorkPlannedMs,
          remainingMs: nextWorkPlannedMs,
          lastTickTs: null,
          expectedEndTime: undefined,
          startWallTime: undefined,
          workBreakPhase: 'work',
          totalPauseDurationMs: 0,
          pauses: 0,
          pauseStartTs: null,
          wasEarlyFinish: undefined,
          backgroundBreakStartTs: null,
          backgroundBreakPlannedMs: undefined,
          molaToplamMs: (state.molaToplamMs ?? 0) + breakMola,
          dersCycleDate: bugun,
        })
      },

      /**
       * Sekme tekrar görünür olduğunda çağrılır.
       * Mutlak zaman kullanıldığı için sadece bir tick tetiklemek yeterli —
       * remaining zaten Date.now() üzerinden hesaplanır.
       */
      syncOnVisibilityChange: () => {
        const state = get()
        if (state.status !== 'running') return
        processTick(get as GetState, set)
      },

      /** Alias: syncOnVisibilityChange ile aynı, visibility API fallback için */
      syncTimer: () => {
        const state = get()
        if (state.status !== 'running') return
        processTick(get as GetState, set)
      },

      recoverSession: () => {
        const state = get()
        if (state.status !== 'running' && state.status !== 'paused') return
        set({
          status: 'paused',
          running: false,
          lastTickTs: null,
          pauseStartTs: null,
        })
      },

      discardRecoveredSession: () => {
        get().reset()
      },
    }),
    {
      name: 'timer-storage',
      partialize: (state) => ({
        status: state.status === 'running' || state.status === 'paused' ? state.status : 'idle',
        mode: state.mode,
        elapsedMs: state.elapsedMs,
        plannedMs: state.plannedMs,
        remainingMs: state.remainingMs,
        currentSectionIndex: state.currentSectionIndex,
        isOvertime: state.isOvertime,
        expectedEndTime: state.expectedEndTime,
        startWallTime: state.startWallTime,
        modeConfig: state.modeConfig,
        dersCycle: state.dersCycle,
        dersCycleDate: state.dersCycleDate,
        workBreakPhase: state.workBreakPhase,
        molaToplamMs: state.molaToplamMs,
        totalPauseDurationMs: state.totalPauseDurationMs,
        pomodoroRound: state.pomodoroRound,
        lastPomodoroDate: state.lastPomodoroDate,
      }),
    }
  )
)
