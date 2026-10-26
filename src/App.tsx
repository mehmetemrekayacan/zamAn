import { lazy, useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef, useSyncExternalStore } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTimerStore } from './store/timer'
import { useSessionsStore } from './store/sessions'
import { useSettingsStore } from './store/settings'
import { getUnvan } from './lib/scoring'
import { getTahminFromStatistics } from './lib/tahmin'
import { syncCloud } from './lib/cloudSync'
import { getRozetler } from './lib/rozetler'
import { initDb } from './lib/db'
import { initOfflineSync, processQueue } from './lib/offlineSync'
import { formatMinutesHuman } from './lib/time'
import { unlockAudio } from './lib/notifications'
import { isElectron, onGlobalHotkey, onMiniPlayerChanged } from './lib/electronBridge'
import { MODE_DEFAULTS, MODE_LABELS, MODE_EMOJIS } from './lib/modeConfig'
import { DashboardHeader } from './components/DashboardHeader'
import { TimerHero } from './components/TimerHero'
import { ModeSelector } from './components/ModeSelector'
import { QuickStatsBar } from './components/QuickStatsBar'
import { SessionHistory } from './components/SessionHistory'
import { CareerPanel } from './components/CareerPanel'
import { BottomSheet } from './components/BottomSheet'
import { FinishScreen } from './components/FinishScreen'
import { UpdatePrompt } from './components/UpdatePrompt'
import { Toast } from './components/Toast'
import { TimerTitleAndTraySync } from './components/TimerTitleAndTraySync'
import { MiniPlayer } from './components/MiniPlayer'
import { LazyContent } from './components/LazyContent'
import { ModalDialog } from './components/ModalDialog'
import { hasOpenDialog } from './lib/dialogStack'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { ModeConfig } from './types'
import { getSupabase } from './lib/supabase'
import { getDataScope, isCurrentScope, subscribeDataScope, type DataScope } from './lib/dataScope'
import { activateAccount } from './lib/accountLifecycle'
import { getScopedStorage } from './lib/accountStorage'
import { saveFinishedSession } from './lib/saveFinishedSession'
import { blockTimerControls, runTimerShortcut } from './lib/timerControls'
import { summarizeStudyStatistics } from './lib/studyStatistics'
import { useStudyStatistics } from './lib/useStudyStatistics'
import { dateForCalendar, useLocalCalendar } from './lib/localCalendarClock'

const SettingsModal = lazy(() => import('./components/SettingsModal').then(module => ({ default: module.SettingsModal })))
const AnalyticsPage = lazy(() => import('./components/analytics/AnalyticsPage').then(module => ({ default: module.AnalyticsPage })))
const DenemeManager = lazy(() => import('./components/DenemeManager').then(module => ({ default: module.DenemeManager })))

const viewLoading = <div role="status" className="p-6 text-sm text-text-muted">Yükleniyor…</div>

/* ─── helpers ─── */

const clonePreset = (config: ModeConfig): ModeConfig => {
  if (config.mode === 'deneme') {
    return {
      ...config,
      currentSectionIndex: 0,
      bolumler: config.bolumler.map((b) => ({ ...b })),
    }
  }
  return { ...config }
}


const normalizeExamStartTime = (value: string, fallback: string): string => {
  if (!value) return fallback
  if (!/^\d{2}:\d{2}$/.test(value)) return fallback
  return value
}

/* ─── App ─── */

function App() {
  const scope = useSyncExternalStore(subscribeDataScope, getDataScope, getDataScope)
  const [hydrated, setHydrated] = useState<DataScope | null>(null)
  const [error, setError] = useState<{ scope: DataScope; message: string } | null>(null)
  const [isMiniPlayerMode, setIsMiniPlayerMode] = useState(false)

  useLayoutEffect(() => {
    if (hydrated !== scope || error?.scope === scope) return blockTimerControls()
  }, [hydrated, scope, error])

  useEffect(() => {
    let mounted = true
    const scheduled = new Set<ReturnType<typeof setTimeout>>()
    const receive = (event: AuthChangeEvent, session: Session | null) => {
      if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT'].includes(event)) return
      const ownerId = session?.user.id ?? null
      const activating = activateAccount(ownerId)
      const requested = getDataScope()
      void activating.then((activeScope) => {
        if (!mounted || !isCurrentScope(activeScope)) return
        setHydrated(activeScope)
        setError(null)
        if (ownerId === null) return
        // Auth callback'inin dışında başlat: Supabase auth kilidi tutulmaz.
        const timeout = setTimeout(() => {
          scheduled.delete(timeout)
          if (!mounted || !isCurrentScope(activeScope)) return
          void (async () => {
            const result = await syncCloud()
            if (isCurrentScope(activeScope) && !result.ok) console.warn('Hesap eşitlemesi bekliyor:', result.error)
          })().catch((failure) => console.error('Hesap eşitlemesi tamamlanamadı:', failure))
        }, 0)
        scheduled.add(timeout)
      }).catch((failure: unknown) => {
        if (mounted && isCurrentScope(requested)) {
          setError({ scope: requested, message: failure instanceof Error ? failure.message : 'Hesap verileri yüklenemedi.' })
        }
      })
    }
    const supabase = getSupabase()
    const subscription = supabase?.auth.onAuthStateChange(receive).data.subscription
    if (!supabase) receive('INITIAL_SESSION', null)
    return () => {
      mounted = false
      subscription?.unsubscribe()
      for (const timeout of scheduled) clearTimeout(timeout)
    }
  }, [])

  // Bu dinleyiciler hesap ekranıyla birlikte tekrar kaydedilmez.
  useEffect(() => {
    if (!isElectron()) return
    const stopHotkeys = onGlobalHotkey((action) => {
      if (action === 'startStop' || action === 'reset') runTimerShortcut(action)

    })
    const stopMiniPlayer = onMiniPlayerChanged((enabled) => setIsMiniPlayerMode(Boolean(enabled)))
    return () => { stopHotkeys(); stopMiniPlayer() }
  }, [])

  if (error?.scope === scope) {
    return <div className="min-h-screen bg-surface-900 p-8 text-text-primary" role="alert">{error.message}</div>
  }
  if (hydrated !== scope) {
    return <div className="min-h-screen bg-surface-900 p-8 text-text-primary" role="status">Hesap verileri yükleniyor…</div>
  }
  return <AccountApp key={scope.generation} isMiniPlayerMode={isMiniPlayerMode} />
}

function AccountApp({ isMiniPlayerMode }: { isMiniPlayerMode: boolean }) {
  const calendar = useLocalCalendar()
  const accountScope = getDataScope()
  const scopedStorage = useMemo(() => getScopedStorage(accountScope), [accountScope])
  const didRunRecoveryCheckRef = useRef(false)

  /* ── local state ── */
  const [showSettings, setShowSettings] = useState(false)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [activeView, setActiveView] = useState<'timer' | 'analytics' | 'deneme-manager'>('timer')
  const [savingSession, setSavingSession] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const savingSessionRef = useRef(false)
  const notifiedSessionRef = useRef<string | null>(null)
  const [sessionsReady, setSessionsReady] = useState(false)

  /* Toast geri bildirim state */
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'celebration'; key: number } | null>(null)
  const showToast = useCallback((message: string, type: 'success' | 'info' | 'celebration' = 'info') => {
    setToast({ message, type, key: Date.now() })
  }, [])
  const dismissToast = useCallback(() => setToast(null), [])

  // Countdown config
  const [countdownHours, setCountdownHours] = useState(0)
  const [countdownMinutes, setCountdownMinutes] = useState(10)
  const [countdownSeconds, setCountdownSeconds] = useState(0)

  // Deneme section editor
  const [sectionName, setSectionName] = useState('')
  const [sectionHours, setSectionHours] = useState(0)
  const [sectionMinutes, setSectionMinutes] = useState(30)
  const [sectionSeconds, setSectionSeconds] = useState(0)
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null)
  const [savedDenemeConfig, setSavedDenemeConfig] = useState<ModeConfig | null>(() => {
    try {
      const saved = scopedStorage.getItem('deneme-config')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  /* ── stores ── */
  const statistics = useStudyStatistics()
  const syncStatusById = useSessionsStore((s) => s.syncStatusById)
  const refreshSyncStatuses = useSessionsStore((s) => s.refreshSyncStatuses)
  const settings = useSettingsStore(useShallow(s => ({ tema: s.tema, kısayollar: s.kısayollar, kullaniciAdi: s.kullaniciAdi, sinavTarihi: s.sinavTarihi })))

  const {
    mode,
    modeConfig,
    status,
    currentSectionIndex,
    workBreakPhase,
    dersCycle,
    pauses,
    start,
    pause,
    resume,
    reset,
    setModeConfig,
    jumpToSection,
    finishEarly,
    finishBreakEarly,
    recoverSession,
    continueRecoveredSession,
    finishRecoveredSession,
    discardRecoveredSession,
    finishedSession,
    finishScore,
    finishForm,
    updateFinishForm,
    completeFinishedSession,
  } = useTimerStore(useShallow(s => ({
    mode: s.mode, modeConfig: s.modeConfig, status: s.status,
    currentSectionIndex: s.currentSectionIndex, workBreakPhase: s.workBreakPhase,
    dersCycle: s.dersCycle, pauses: s.pauses,
    start: s.start, pause: s.pause, resume: s.resume, reset: s.reset,
    setModeConfig: s.setModeConfig, jumpToSection: s.jumpToSection,
    finishEarly: s.finishEarly, finishBreakEarly: s.finishBreakEarly,
    recoverSession: s.recoverSession, continueRecoveredSession: s.continueRecoveredSession,
    finishRecoveredSession: s.finishRecoveredSession, discardRecoveredSession: s.discardRecoveredSession,
    finishedSession: s.finishedSession, finishScore: s.finishScore, finishForm: s.finishForm,
    updateFinishForm: s.updateFinishForm, completeFinishedSession: s.completeFinishedSession,
  })))
  const denemeAdi = finishForm?.examName ?? ''
  const setDenemeAdi = (examName: string) => updateFinishForm({ examName })

  /* ── init ── */
  const loadSessions = useCallback(async () => {
    try {
      await initDb()
      initOfflineSync(() => {
        void refreshSyncStatuses()
      }) // Offline sync kuyruğu dinleyicisini başlat
      const state = useSessionsStore.getState()
      await state.loadSessions()
      if (isCurrentScope(accountScope)) setSessionsReady(true)
      await processQueue()
      await refreshSyncStatuses()
    } catch (error) {
      console.error('Failed to initialize DB:', error)
    }
  }, [refreshSyncStatuses, accountScope])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useLayoutEffect(() => {
    if (didRunRecoveryCheckRef.current) return
    didRunRecoveryCheckRef.current = true

    const timerState = useTimerStore.getState()
    const hasRecoverableSession = timerState.status === 'running' || timerState.status === 'paused'
    if (!hasRecoverableSession) return

    setShowRecoveryModal(recoverSession())
  }, [recoverSession])

  const handleRecoveryFinish = useCallback(() => {
    finishRecoveredSession()
    setShowRecoveryModal(false)
  }, [finishRecoveredSession])

  const handleRecoveryContinue = useCallback(() => {
    continueRecoveredSession()
    setShowRecoveryModal(false)
  }, [continueRecoveredSession])

  const handleRecoveryDiscard = useCallback(() => {
    discardRecoveredSession()
    setShowRecoveryModal(false)
  }, [discardRecoveredSession])

  /* ── effects ── */

  useEffect(() => {
    if (!isCurrentScope(accountScope)) return
    if (modeConfig?.mode === 'deneme') {
      setSavedDenemeConfig(modeConfig)
      scopedStorage.setItem('deneme-config', JSON.stringify(modeConfig))
    }
  }, [modeConfig, accountScope, scopedStorage])

  useEffect(() => {
    const update = () => {
      if (!isCurrentScope(accountScope)) return
      const raw = scopedStorage.getItem('deneme-config')
      setSavedDenemeConfig(raw ? JSON.parse(raw) as ModeConfig : null)
    }
    window.addEventListener('zaman-preferences-updated', update)
    return () => window.removeEventListener('zaman-preferences-updated', update)
  }, [accountScope, scopedStorage])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', settings.tema)
    if (settings.tema === 'light') {
      root.classList.add('light-theme')
      root.classList.remove('dark-theme', 'high-contrast-theme')
    } else if (settings.tema === 'high-contrast') {
      root.classList.add('high-contrast-theme')
      root.classList.remove('dark-theme', 'light-theme')
    } else {
      root.classList.add('dark-theme')
      root.classList.remove('light-theme', 'high-contrast-theme')
    }
  }, [settings.tema])

  /* ── actions ── */
  const toggleSettings = useCallback(() => {
    setShowSettings((prev) => !prev)
  }, [])

  const examConfig = modeConfig.mode === 'EXAM_SIMULATOR' ? modeConfig : null
  const examStartTime = examConfig?.startTimeHHmm ?? '14:45'
  const examDurationMinutes = useMemo(() => {
    if (modeConfig.mode !== 'EXAM_SIMULATOR') return 90
    return Math.max(1, Math.round(modeConfig.sureMs / 60000))
  }, [modeConfig])

  const handleExamStartTimeChange = useCallback((value: string) => {
    const normalized = normalizeExamStartTime(value, examStartTime)
    setModeConfig({
      mode: 'EXAM_SIMULATOR',
      startTimeHHmm: normalized,
      sureMs: examDurationMinutes * 60 * 1000,
    })
  }, [examStartTime, examDurationMinutes, setModeConfig])

  const handleExamDurationChange = useCallback((minutes: number) => {
    const safeMinutes = Math.max(1, minutes)
    setModeConfig({
      mode: 'EXAM_SIMULATOR',
      startTimeHHmm: examStartTime,
      sureMs: safeMinutes * 60 * 1000,
    })
  }, [examStartTime, setModeConfig])

  /* ── Visibility API Fallback: sekmeye dönünce timer senkronize et ── */
  useEffect(() => {
    const handler = () => {
      useTimerStore.getState().syncTimer()
    }
    document.addEventListener('visibilitychange', handler)
    window.addEventListener('pagehide', handler)
    return () => {
      document.removeEventListener('visibilitychange', handler)
      window.removeEventListener('pagehide', handler)
    }
  }, [])

  useEffect(() => {
    if (status !== 'finished' || !sessionsReady) return
    const timer = useTimerStore.getState()
    timer.prepareFinishedSession(useSessionsStore.getState().sessions)
    const current = useTimerStore.getState()
    if (!current.finishedSession || !current.finishScore || notifiedSessionRef.current === current.finishedSession.id) return
    notifiedSessionRef.current = current.finishedSession.id
    const s = useSettingsStore.getState()
    const score = current.finishScore
    import('./lib/notifications').then(({ notifySessionComplete }) => {
      if (!isCurrentScope(accountScope)) return
      notifySessionComplete({
        enableSound: !s.sessizMod && s.sesAçık,
        enableVibration: !s.sessizMod && s.titreşimAçık,
        enableBrowserNotification: s.bildirimİzni === 'granted',
        title: `Seans Tamamlandı! 🎉 (${score.totalScore} puan)`,
        body: `${MODE_LABELS[mode] ?? mode} seansınız tamamlandı.`,
      })
    })
  }, [status, sessionsReady, mode, accountScope])

  useLayoutEffect(() => {
    if (showSettings || showRecoveryModal || status === 'finished' || activeView !== 'timer') return blockTimerControls()
  }, [showSettings, showRecoveryModal, status, activeView])

  const primaryLabel = status === 'running' ? 'Duraklat' : status === 'paused' ? 'Devam' : 'Başlat'
  const primaryAction = useCallback(() => {
    if (!isCurrentScope(accountScope) || showSettings || showRecoveryModal || status === 'finished') return
    // Kullanıcı gesture'ı altında AudioContext'i unlock et (autoplay politikası)
    if (status !== 'running') {
      unlockAudio()
    }
    if (status === 'running') return pause()
    if (status === 'paused') return resume()
    return start()
  }, [status, pause, resume, start, accountScope, showSettings, showRecoveryModal])

  const saveSession = async () => {
    if (!isCurrentScope(accountScope) || savingSessionRef.current) return
    savingSessionRef.current = true
    setSavingSession(true)
    setSaveError(null)
    try {
      const record = await saveFinishedSession(accountScope)
      if (!isCurrentScope(accountScope)) return
      completeFinishedSession(record.id)
      setDenemeAdi('')
      showToast(`Seans kaydedildi! +${record.puan} puan 🎉`, 'success')
    } catch (error) {
      if (isCurrentScope(accountScope)) setSaveError(error instanceof Error ? error.message : 'Seans kaydedilemedi. Tekrar deneyebilirsiniz.')
    } finally {
      savingSessionRef.current = false
      if (isCurrentScope(accountScope)) setSavingSession(false)
    }
  }

  /* ── keyboard shortcuts ── */
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || hasOpenDialog()) return
      const target = e.target
      if (target instanceof Element && target.closest('input, textarea, select, button, a[href], [role="button"], [contenteditable="true"]')) return
      if (showSettings || showRecoveryModal || status === 'finished' || activeView !== 'timer') return
      if (e.code === settings.kısayollar.startStop) {
        e.preventDefault()
        primaryAction()
      }
      if (e.code === settings.kısayollar.reset) {
        e.preventDefault()
        runTimerShortcut('reset')
      }
      if (e.code === settings.kısayollar.modGeçiş) {
        e.preventDefault()
        if (useTimerStore.getState().status !== 'idle') {
          showToast('Mod değiştirmek için önce seansı bitirin veya sıfırlayın.')
          return
        }
        const modeList = ['serbest', 'gerisayim', 'EXAM_SIMULATOR', 'ders60mola15', 'deneme'] as const
        const currentIdx = modeList.indexOf(mode as (typeof modeList)[number])
        const nextIdx = (currentIdx + 1) % modeList.length
        const nextMode = modeList[nextIdx]
        if (nextMode === 'deneme' && savedDenemeConfig) {
          setModeConfig(savedDenemeConfig)
        } else if (nextMode === 'EXAM_SIMULATOR') {
          setModeConfig({
            mode: 'EXAM_SIMULATOR',
            startTimeHHmm: examStartTime,
            sureMs: examDurationMinutes * 60 * 1000,
          })
        } else {
          setModeConfig(clonePreset(MODE_DEFAULTS[nextMode]))
        }
      }
    }
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [settings.kısayollar, status, primaryAction, mode, setModeConfig, savedDenemeConfig, showSettings, showRecoveryModal, activeView, showToast, examStartTime, examDurationMinutes])

  const summary = useMemo(() => {
    const stats = summarizeStudyStatistics(statistics, dateForCalendar(calendar))
    const lastSessions = [...stats.completed].sort((a, b) => Date.parse(b.tarihISO) - Date.parse(a.tarihISO)).slice(0, 10)
    const toplamKariyerPuan = stats.completed.reduce((sum, session) => sum + session.puan, 0)
    const gunluk5SaatGunSayisi = [...stats.dailySeconds.values()].filter((seconds) => seconds >= 5 * 3600).length
    return {
      todayMinutes: Math.round(stats.todaySeconds / 60), todayScore: stats.todayScore,
      todaySessions: stats.todaySessions.length, streak: stats.streak,
      weekMinutes: Math.round(stats.weekSeconds / 60), weekSessions: stats.weekSessions.length,
      monthMinutes: Math.round(stats.monthSeconds / 60), monthSessions: stats.monthSessions.length,
      avgScoreMonth: stats.avgScoreMonth, lastSessions, toplamKariyerPuan,
      unvan: getUnvan(toplamKariyerPuan), tahmin: getTahminFromStatistics(stats),
      rozetler: getRozetler({ gunluk5SaatGunSayisi, streak: stats.streak, toplamKariyerPuan, monthSeconds: stats.monthSeconds, sessions: stats.completed }),
    }
  }, [statistics, calendar])

  const statsData = useMemo(() => [
    { label: 'Bugün', value: formatMinutesHuman(summary.todayMinutes), hint: `${summary.todaySessions} tamamlanan seans`, tone: 'primary' as const },
    { label: 'Bu Hafta', value: formatMinutesHuman(summary.weekMinutes), hint: `${summary.weekSessions} tamamlanan seans`, tone: 'info' as const },
    { label: 'Seri', value: `${summary.streak}`, hint: 'ardışık gün', tone: 'warning' as const },
    { label: 'Puan', value: `${summary.todayScore}`, hint: 'bugün', tone: 'success' as const },
  ], [summary])

  useEffect(() => {
    document.documentElement.setAttribute('data-tier', summary.unvan.temaClass)
  }, [summary.unvan.temaClass])

  /* ── mode select handler ── */
  const handleModeSelect = useCallback(
    (modeId: 'serbest' | 'gerisayim' | 'EXAM_SIMULATOR' | 'ders60mola15' | 'deneme') => {
      if (useTimerStore.getState().status !== 'idle') {
        showToast('Mod değiştirmek için önce seansı bitirin veya sıfırlayın.')
        return
      }
      if (modeId === 'deneme' && savedDenemeConfig) {
        setModeConfig(savedDenemeConfig)
      } else if (modeId === 'EXAM_SIMULATOR') {
        setModeConfig({
          mode: 'EXAM_SIMULATOR',
          startTimeHHmm: examStartTime,
          sureMs: examDurationMinutes * 60 * 1000,
        })
      } else {
        setModeConfig(clonePreset(MODE_DEFAULTS[modeId]))
      }
      showToast(`${MODE_EMOJIS[modeId]} ${MODE_LABELS[modeId]} moduna geçildi`, 'info')
    },
    [savedDenemeConfig, setModeConfig, showToast, examStartTime, examDurationMinutes],
  )

  /* ═══════════════════════ RENDER ═══════════════════════ */

  // Taslak ve form hesap deposunda tutulur; yenilemede aynı seans açılır.
  if (status === 'finished') {
    if (!finishedSession || !finishScore) return <div role="status" className="min-h-screen bg-surface-900 p-8 text-text-primary">Seans hazırlanıyor…</div>
    const isExam = mode === 'deneme' || mode === 'EXAM_SIMULATOR'
    return (
      <FinishScreen
        score={finishScore}
        mode={mode}
        sessionNote={finishForm?.note ?? ''}
        onSessionNoteChange={(note) => updateFinishForm({ note })}
        denemeAnaliz={isExam ? finishForm?.analysis : undefined}
        onDenemeAnalizChange={isExam ? (analysis) => updateFinishForm({ analysis }) : undefined}
        examName={isExam ? finishForm?.examName || denemeAdi : undefined}
        onExamNameChange={isExam ? (examName) => updateFinishForm({ examName }) : undefined}
        saving={savingSession}
        saveError={saveError}
        onSave={saveSession}
        onCancel={() => {
          if (savingSessionRef.current) return
          completeFinishedSession(finishedSession.id)
          setSaveError(null)
          setDenemeAdi('')
        }}
      />
    )
  }

  if (isMiniPlayerMode && !showRecoveryModal && !showSettings) {
    return (
      <MiniPlayer
        primaryLabel={primaryLabel}
        primaryAction={primaryAction}
        finishBreakEarly={finishBreakEarly}
        finishEarly={finishEarly}
      />
    )
  }

  return (
    <div className={`min-h-screen bg-surface-900 text-text-primary ${isMiniPlayerMode ? 'mini-player-drag' : ''}`}>
      <TimerTitleAndTraySync />
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 pb-16 pt-8 sm:px-8">
        {/* ════════  BÖLÜM 1 — HEADER  ════════ */}
        <DashboardHeader
          kullaniciAdi={settings.kullaniciAdi ?? ''}
          sinavTarihi={settings.sinavTarihi ?? null}
          unvanEmoji={summary.unvan.profilEmoji}
          unvanText={summary.unvan.unvan}
          onSettingsClick={toggleSettings}
        />

        <div className="w-full md:flex md:justify-end">
          <div className="grid w-full grid-cols-3 rounded-full border border-text-primary/10 bg-surface-700/50 p-1 md:inline-flex md:w-auto md:min-w-[360px]">
            <button
              type="button"
              onClick={() => setActiveView('timer')}
              className={`w-full rounded-full px-3 py-2 text-center text-xs font-semibold transition sm:text-sm ${
                activeView === 'timer'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Zamanlayıcı
            </button>
            <button
              type="button"
              onClick={() => setActiveView('analytics')}
              className={`w-full rounded-full px-3 py-2 text-center text-xs font-semibold transition sm:text-sm ${
                activeView === 'analytics'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              İstatistikler
            </button>
            <button
              type="button"
              onClick={() => setActiveView('deneme-manager')}
              className={`w-full rounded-full px-3 py-2 text-center text-xs font-semibold transition sm:text-sm ${
                activeView === 'deneme-manager'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Denemelerim
            </button>
          </div>
        </div>

        {activeView === 'timer' ? (
          <>
            {/* Hızlı istatistik çubuğu */}
            <QuickStatsBar stats={statsData} />

            {/* ════════  BÖLÜM 2 — TIMER HERO  ════════ */}
            <TimerHero
              status={status}
              mode={mode}
              workBreakPhase={workBreakPhase}
              dersCycle={dersCycle}
              pauses={pauses}
              primaryLabel={primaryLabel}
              primaryAction={primaryAction}
              onFinishEarly={finishEarly}
              onReset={reset}
              isBreakMode={mode === 'ders60mola15' && workBreakPhase === 'break'}
              onFinishBreak={finishBreakEarly}
              examStartTime={examStartTime}
              examDurationMinutes={examDurationMinutes}
              onExamStartTimeChange={handleExamStartTimeChange}
              onExamDurationMinutesChange={handleExamDurationChange}
            />

            {/* Mod seçici — Timer'ın hemen altında */}
            <ModeSelector currentMode={modeConfig.mode} onSelect={handleModeSelect} />

            {/* Mod konfigürasyon paneli (gerisayim / deneme) */}
            <fieldset disabled={status !== 'idle'} className="min-w-0">
            <ModeConfigPanel
              modeConfig={modeConfig}
              setModeConfig={setModeConfig}
              countdownHours={countdownHours}
              countdownMinutes={countdownMinutes}
              countdownSeconds={countdownSeconds}
              setCountdownHours={setCountdownHours}
              setCountdownMinutes={setCountdownMinutes}
              setCountdownSeconds={setCountdownSeconds}
              sectionName={sectionName}
              setSectionName={setSectionName}
              sectionHours={sectionHours}
              setSectionHours={setSectionHours}
              sectionMinutes={sectionMinutes}
              setSectionMinutes={setSectionMinutes}
              sectionSeconds={sectionSeconds}
              setSectionSeconds={setSectionSeconds}
              editingSectionIndex={editingSectionIndex}
              setEditingSectionIndex={setEditingSectionIndex}
              currentSectionIndex={currentSectionIndex}
              jumpToSection={jumpToSection}
              denemeAdi={denemeAdi}
              setDenemeAdi={setDenemeAdi}
            />
            </fieldset>

            {/* ════════  BÖLÜM 3 — DASHBOARD  ════════ */}

            {/* Masaüstü: normal grid */}
            <section className="hidden lg:grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <SessionHistory sessions={summary.lastSessions} syncStatusById={syncStatusById} />
              <CareerPanel
                toplamPuan={summary.toplamKariyerPuan}
                unvanEmoji={summary.unvan.profilEmoji}
                unvanText={summary.unvan.unvan}
                sonrakiUnvan={summary.unvan.sonrakiUnvan ?? undefined}
                sonrakiPuan={summary.unvan.sonrakiPuan ?? undefined}
                ilerlemeYuzde={summary.unvan.ilerlemeYuzde ?? undefined}
                tahmin={summary.tahmin ?? undefined}
                monthMinutes={summary.monthMinutes}
                monthSessions={summary.monthSessions}
                avgScoreMonth={summary.avgScoreMonth}
                rozetler={summary.rozetler}
              />
            </section>

            {/* Mobil: Bottom Sheet */}
            <BottomSheet
              summary={
                <span className="flex items-center justify-center gap-3 text-sm">
                  <span className="font-medium text-text-primary">{summary.unvan.profilEmoji} {summary.unvan.unvan}</span>
                  <span className="text-text-muted">·</span>
                  <span>{summary.lastSessions.length} seans</span>
                  <span className="text-text-muted">·</span>
                  <span className="text-info font-semibold">{summary.toplamKariyerPuan} puan</span>
                </span>
              }
            >
              <div className="space-y-5">
                <SessionHistory sessions={summary.lastSessions} syncStatusById={syncStatusById} />
                <CareerPanel
                  toplamPuan={summary.toplamKariyerPuan}
                  unvanEmoji={summary.unvan.profilEmoji}
                  unvanText={summary.unvan.unvan}
                  sonrakiUnvan={summary.unvan.sonrakiUnvan ?? undefined}
                  sonrakiPuan={summary.unvan.sonrakiPuan ?? undefined}
                  ilerlemeYuzde={summary.unvan.ilerlemeYuzde ?? undefined}
                  tahmin={summary.tahmin ?? undefined}
                  monthMinutes={summary.monthMinutes}
                  monthSessions={summary.monthSessions}
                  avgScoreMonth={summary.avgScoreMonth}
                  rozetler={summary.rozetler}
                />
              </div>
            </BottomSheet>
          </>
        ) : activeView === 'analytics' ? (
          <LazyContent key="analytics" fallback={viewLoading} onClose={() => setActiveView('timer')}><AnalyticsPage /></LazyContent>
        ) : (
          <LazyContent key="deneme" fallback={viewLoading} onClose={() => setActiveView('timer')}><DenemeManager onClose={() => setActiveView('timer')} /></LazyContent>
        )}

        {/* Settings Modal */}
        {showSettings && <ModalDialog label="Ayarlar" onClose={() => setShowSettings(false)} className="flex w-full max-w-sm flex-col rounded-card border border-text-primary/10 bg-surface-800 shadow-2xl">
          <LazyContent onClose={() => setShowSettings(false)} fallback={<div role="status" className="p-6 text-text-primary">Ayarlar yükleniyor…</div>}>
            <SettingsModal onClose={() => setShowSettings(false)} />
          </LazyContent>
        </ModalDialog>}

        {/* Session Recovery Modal */}
        {showRecoveryModal && (
          <ModalDialog label="Oturum Kurtarma" className="w-full max-w-md rounded-card border border-text-primary/10 bg-surface-800 p-6 shadow-2xl">
              <h3 id="recovery-title" className="font-display text-xl text-text-primary">Oturum Kurtarma</h3>
              <p className="mt-3 text-sm text-text-muted">
                Son kaydedilen çalışma süreniz korundu. Kapalı kaldığı bilinmeyen süre ve bu ekranda bekleme çalışma süresine eklenmez. Sınav Saati modunda açılışa kadar sabit bitiş saati uygulanır.
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleRecoveryFinish}
                  className="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  Bitir ve Kayıt Ekranını Aç
                </button>
                <button
                  type="button"
                  onClick={handleRecoveryContinue}
                  className="w-full rounded-full border border-text-primary/15 bg-surface-700/50 px-5 py-2.5 text-sm font-semibold text-text-primary transition hover:border-primary/50"
                >
                  Kaldığım Yerden Devam Et
                </button>
                <button
                  type="button"
                  onClick={handleRecoveryDiscard}
                  className="w-full rounded-full border border-danger/50 bg-danger/10 px-5 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/20"
                >
                  Kaydetmeden Sil
                </button>
              </div>
          </ModalDialog>
        )}

        {/* Global Toast */}
        <Toast
          key={toast?.key}
          message={toast?.message ?? ''}
          visible={!!toast}
          type={toast?.type ?? 'info'}
          duration={2500}
          onDismiss={dismissToast}
        />

        {/* PWA Güncelleme Banner'ı */}
        <UpdatePrompt />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   Mod Konfigürasyon Paneli (gerisayım / deneme)
   ═══════════════════════════════════════════════════ */

function ModeConfigPanel({
  modeConfig,
  setModeConfig,
  countdownHours,
  countdownMinutes,
  countdownSeconds,
  setCountdownHours,
  setCountdownMinutes,
  setCountdownSeconds,
  sectionName,
  setSectionName,
  sectionHours,
  setSectionHours,
  sectionMinutes,
  setSectionMinutes,
  sectionSeconds,
  setSectionSeconds,
  editingSectionIndex,
  setEditingSectionIndex,
  currentSectionIndex,
  jumpToSection,
  denemeAdi,
  setDenemeAdi,
}: {
  modeConfig: ModeConfig
  setModeConfig: (c: ModeConfig) => void
  countdownHours: number
  countdownMinutes: number
  countdownSeconds: number
  setCountdownHours: (v: number) => void
  setCountdownMinutes: (v: number) => void
  setCountdownSeconds: (v: number) => void
  sectionName: string
  setSectionName: (v: string) => void
  sectionHours: number
  setSectionHours: (v: number) => void
  sectionMinutes: number
  setSectionMinutes: (v: number) => void
  sectionSeconds: number
  setSectionSeconds: (v: number) => void
  editingSectionIndex: number | null
  setEditingSectionIndex: (v: number | null) => void
  currentSectionIndex?: number
  jumpToSection: (idx: number) => void
  denemeAdi: string
  setDenemeAdi: (v: string) => void
}) {
  if (modeConfig.mode === 'gerisayim') {
    return (
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-info/25 bg-info/10 p-5">
        <p className="mb-4 text-sm font-semibold text-text-primary">⏳ Zamanlayıcı Süresi</p>
        <div className="flex gap-3">
          {[
            { label: 'Saat', value: countdownHours, max: 23, set: setCountdownHours },
            { label: 'Dakika', value: countdownMinutes, max: 59, set: setCountdownMinutes },
            { label: 'Saniye', value: countdownSeconds, max: 59, set: setCountdownSeconds },
          ].map((f) => (
            <div key={f.label} className="flex-1">
              <label className="mb-2 block text-xs text-text-muted">{f.label}</label>
              <input
                type="number"
                min="0"
                max={f.max}
                value={f.value}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(f.max, parseInt(e.target.value) || 0))
                  f.set(val)
                  const h = f.label === 'Saat' ? val : countdownHours
                  const m = f.label === 'Dakika' ? val : countdownMinutes
                  const s = f.label === 'Saniye' ? val : countdownSeconds
                  setModeConfig({ mode: 'gerisayim', sureMs: (h * 3600 + m * 60 + s) * 1000 })
                }}
                className="w-full rounded-xl border border-text-primary/10 bg-surface-700 px-3 py-2.5 text-center text-text-primary focus:border-info/50 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (modeConfig.mode === 'deneme') {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-warning/25 bg-warning/10 p-5">
        <p className="mb-4 text-sm font-semibold text-text-primary">📋 Sınav Bölümleri</p>

        {/* Mevcut bölümler */}
        <div className="mb-4 space-y-2 rounded-xl bg-surface-900/40 p-3">
          {modeConfig.bolumler.map((bolum, idx) => {
            const isActive = idx === (currentSectionIndex ?? modeConfig.currentSectionIndex ?? 0)
            return (
              <button
                key={idx}
                onClick={() => jumpToSection(idx)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left transition ${
                  isActive
                    ? 'border-warning/50 bg-warning/10 text-text-primary font-semibold'
                    : 'border-text-primary/5 text-text-muted hover:border-info/30'
                }`}
              >
                <span className="text-sm">{bolum.ad}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs">{Math.floor(bolum.surePlanMs / 60000)} dk</span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      setSectionName(bolum.ad)
                      setSectionHours(Math.floor(bolum.surePlanMs / 3600000))
                      setSectionMinutes(Math.floor((bolum.surePlanMs % 3600000) / 60000))
                      setSectionSeconds(Math.floor((bolum.surePlanMs % 60000) / 1000))
                      setEditingSectionIndex(idx)
                    }}
                    className="cursor-pointer text-xs text-info hover:text-info/80"
                  >
                    ✏️
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      const newBolumler = modeConfig.bolumler.filter((_, i) => i !== idx)
                      setModeConfig({
                        ...modeConfig,
                        bolumler: newBolumler.length > 0 ? newBolumler : [{ ad: 'Bölüm 1', surePlanMs: 30 * 60 * 1000 }],
                      })
                    }}
                    className="cursor-pointer text-xs text-danger hover:text-danger/80"
                  >
                    🗑️
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Bölüm ekle/düzenle */}
        <div className="space-y-3 rounded-xl border border-text-primary/10 bg-surface-900/30 p-4">
          <div>
            <label className="mb-2 block text-xs font-semibold text-text-primary">Bölüm Adı</label>
            <input
              type="text"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="ör. Türkçe, Matematik..."
              className="w-full rounded-xl border border-text-primary/10 bg-surface-700 px-3 py-2.5 text-text-primary placeholder-text-muted focus:border-info/50 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Saat', value: sectionHours, max: 23, set: setSectionHours },
              { label: 'Dakika', value: sectionMinutes, max: 59, set: setSectionMinutes },
              { label: 'Saniye', value: sectionSeconds, max: 59, set: setSectionSeconds },
            ].map((f) => (
              <div key={f.label}>
                <label className="mb-2 block text-xs text-text-muted">{f.label}</label>
                <input
                  type="number"
                  min="0"
                  max={f.max}
                  value={f.value}
                  onChange={(e) => f.set(Math.max(0, Math.min(f.max, parseInt(e.target.value) || 0)))}
                  className="w-full rounded-xl border border-text-primary/10 bg-surface-700 px-2 py-2.5 text-center text-text-primary focus:border-info/50 focus:outline-none"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (sectionName.trim()) {
                  const surePlanMs = (sectionHours * 3600 + sectionMinutes * 60 + sectionSeconds) * 1000
                  if (editingSectionIndex !== null) {
                    const updated = [...modeConfig.bolumler]
                    updated[editingSectionIndex] = { ad: sectionName, surePlanMs }
                    setModeConfig({ ...modeConfig, bolumler: updated })
                    setEditingSectionIndex(null)
                  } else {
                    setModeConfig({ ...modeConfig, bolumler: [...modeConfig.bolumler, { ad: sectionName, surePlanMs }] })
                  }
                  setSectionName('')
                  setSectionHours(0)
                  setSectionMinutes(30)
                  setSectionSeconds(0)
                }
              }}
              className="flex-1 rounded-full bg-warning px-4 py-2.5 text-sm font-semibold text-warning-foreground hover:shadow-lg hover:shadow-warning/30 transition"
            >
              {editingSectionIndex !== null ? '✓ Güncelle' : '+ Ekle'}
            </button>
            {editingSectionIndex !== null && (
              <button
                onClick={() => {
                  setEditingSectionIndex(null)
                  setSectionName('')
                  setSectionHours(0)
                  setSectionMinutes(30)
                  setSectionSeconds(0)
                }}
                className="rounded-full border border-text-primary/10 px-4 py-2.5 text-sm font-semibold text-text-primary hover:border-secondary/60 transition"
              >
                İptal
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (modeConfig.mode === 'EXAM_SIMULATOR') {
    return (
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-secondary/25 bg-secondary/10 p-5">
        <p className="mb-4 text-sm font-semibold text-text-primary">🕒 Sınav Simülasyonu</p>
        <div>
          <label className="mb-2 block text-xs font-semibold text-text-primary">Deneme Adı</label>
          <input
            type="text"
            value={denemeAdi}
            onChange={(e) => setDenemeAdi(e.target.value)}
            placeholder="ör. TYT Deneme 1, KPSS Mart…"
            className="w-full rounded-xl border border-text-primary/10 bg-surface-700 px-3 py-2 text-text-primary placeholder-text-muted focus:border-secondary/50 focus:outline-none"
          />
        </div>
      </div>
    )
  }

  return null
}

export default App
