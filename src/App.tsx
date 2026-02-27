import { useMemo, useState, useEffect, useCallback } from 'react'
import { MODE_DEFAULTS, useTimerStore } from './store/timer'
import { useSessionsStore } from './store/sessions'
import { useSettingsStore } from './store/settings'
import { calculateScore, calculateStreak, getUnvan } from './lib/scoring'
import { getTahmin150Saat } from './lib/tahmin'
import { getRozetler } from './lib/rozetler'
import { initDb } from './lib/db'
import { initOfflineSync, processQueue } from './lib/offlineSync'
import { formatDuration, formatMinutesHuman } from './lib/time'
import { stopTitleFlash } from './lib/notifications'
import { isElectron, onGlobalHotkey, onMiniPlayerChanged, sendTimerUpdate, toggleMiniPlayer } from './lib/electronBridge'
import { DashboardHeader } from './components/DashboardHeader'
import { TimerHero } from './components/TimerHero'
import { ModeSelector } from './components/ModeSelector'
import { QuickStatsBar } from './components/QuickStatsBar'
import { SessionHistory } from './components/SessionHistory'
import { CareerPanel } from './components/CareerPanel'
import { BottomSheet } from './components/BottomSheet'
import { FinishScreen } from './components/FinishScreen'
import { SettingsModal } from './components/SettingsModal'
import { Toast } from './components/Toast'
import { AnalyticsPage } from './components/analytics/AnalyticsPage'
import type { ModeConfig, SessionRecord, RuhHali, DenemeAnaliz } from './types'

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

const MODE_LABELS: Record<string, string> = {
  serbest: 'Kronometre',
  gerisayim: 'Zamanlayıcı',
  ders60mola15: '60/15',
  deneme: 'Deneme',
}

/* ─── App ─── */

function App() {
  /* ── local state ── */
  const [sessionNote, setSessionNote] = useState('')
  const [sessionRuhHali, setSessionRuhHali] = useState<RuhHali | null>(null)
  const [denemeAnaliz, setDenemeAnaliz] = useState<DenemeAnaliz | null>(null)
  const [showFinishScreen, setShowFinishScreen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isMiniPlayerMode, setIsMiniPlayerMode] = useState(false)
  const [activeView, setActiveView] = useState<'timer' | 'analytics'>('timer')
  const [lastSessionScore, setLastSessionScore] = useState<ReturnType<typeof calculateScore> | null>(null)

  /* Toast geri bildirim state */
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'celebration'; key: number } | null>(null)
  const showToast = useCallback((message: string, type: 'success' | 'info' | 'celebration' = 'info') => {
    setToast({ message, type, key: Date.now() })
  }, [])

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
      const saved = localStorage.getItem('deneme-config')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  /* ── stores ── */
  const sessions = useSessionsStore((s) => s.sessions)
  const syncStatusById = useSessionsStore((s) => s.syncStatusById)
  const refreshSyncStatuses = useSessionsStore((s) => s.refreshSyncStatuses)
  const addSession = useSessionsStore((s) => s.addSession)
  const settings = useSettingsStore()

  const {
    mode,
    modeConfig,
    status,
    plannedMs,
    remainingMs,
    elapsedMs,
    currentSectionIndex,
    workBreakPhase,
    dersCycle,
    denemeBreakStartTs,
    denemeMolalarSaniye,
    pauses,
    wasEarlyFinish,
    molaToplamMs,
    totalPauseDurationMs,
    backgroundBreakStartTs,
    backgroundBreakPlannedMs,
    start,
    pause,
    resume,
    reset,
    setModeConfig,
    jumpToSection,
    advanceFromDenemeBreak,
    finishEarly,
    transitionToBreak,
    finishBreakEarly,
  } = useTimerStore()

  /* ── init ── */
  const loadSessions = useCallback(async () => {
    try {
      await initDb()
      initOfflineSync(() => {
        void refreshSyncStatuses()
      }) // Offline sync kuyruğu dinleyicisini başlat
      const state = useSessionsStore.getState()
      await state.loadSessions()
      await processQueue()
      await refreshSyncStatuses()
    } catch (error) {
      console.error('Failed to initialize DB:', error)
    }
  }, [refreshSyncStatuses])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  /* ── effects ── */
  const todaySessions = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return sessions.filter((s) => s.tarihISO.startsWith(today))
  }, [sessions])

  useEffect(() => {
    if (modeConfig?.mode === 'deneme') {
      setSavedDenemeConfig(modeConfig)
      localStorage.setItem('deneme-config', JSON.stringify(modeConfig))
    }
  }, [modeConfig])

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

  useEffect(() => {
    const root = document.documentElement
    if (settings.vurguRengi && settings.vurguRengi !== 'mavi') {
      root.setAttribute('data-vurgu', settings.vurguRengi)
    } else {
      root.removeAttribute('data-vurgu')
    }
  }, [settings.vurguRengi])

  /* ── actions ── */
  const timeToDisplay = plannedMs != null ? remainingMs ?? plannedMs : elapsedMs

  /* ── Dinamik tab başlığı: çalışırken sayaç göster ── */
  useEffect(() => {
    const timeStr = formatDuration(timeToDisplay)
    if (status === 'running') {
      document.title = `▶ ${timeStr} — zamAn`
    } else if (status === 'paused') {
      document.title = `⏸ ${timeStr} — zamAn`
    } else if (status === 'finished') {
      // finished durumunda notifications.ts zaten title flash yapıyor
    } else {
      stopTitleFlash('zamAn')
      document.title = 'zamAn'
    }
    // Electron tray tooltip güncellemesi
    if (isElectron() && (status === 'running' || status === 'paused')) {
      sendTimerUpdate(timeStr)
    }
  }, [status, timeToDisplay])

  /* ── Electron: Global hotkey dinleyicisi ── */
  useEffect(() => {
    if (!isElectron()) return
    onGlobalHotkey((action) => {
      const timerState = useTimerStore.getState()
      if (action === 'startStop') {
        if (timerState.status === 'running') timerState.pause()
        else if (timerState.status === 'paused') timerState.resume()
        else timerState.start()
      } else if (action === 'reset') {
        timerState.reset()
      }
    })
  }, [])

  useEffect(() => {
    if (!isElectron()) return
    onMiniPlayerChanged((enabled) => {
      setIsMiniPlayerMode(Boolean(enabled))
    })
  }, [])

  useEffect(() => {
    if (status === 'finished' && !showFinishScreen) {
      const sessionsState = useSessionsStore.getState()
      const streakDays = calculateStreak(sessionsState.sessions)
      const isFullCompletion = !(wasEarlyFinish ?? false)
      const todayStr = new Date().toISOString().split('T')[0]
      const todayCompletedRounds = sessionsState.sessions.filter(
        (s) => s.tarihISO.startsWith(todayStr) && s.mod === mode
      ).length
      const score = calculateScore(elapsedMs, mode, pauses, isFullCompletion, todayCompletedRounds, streakDays)
      setLastSessionScore(score)
      setShowFinishScreen(true)

      const s = useSettingsStore.getState()
      const isSessiz = s.sessizMod
      import('./lib/notifications').then(({ notifySessionComplete }) => {
        notifySessionComplete({
          enableSound: !isSessiz && s.sesAçık,
          enableVibration: !isSessiz && s.titreşimAçık,
          enableBrowserNotification: s.bildirimİzni === 'granted',
          title: `Seans Tamamlandı! 🎉 (${score.totalScore} puan)`,
          body: `${MODE_LABELS[mode] ?? mode} seansınız tamamlandı.`,
        })
      })
    }
  }, [status, showFinishScreen, elapsedMs, plannedMs, mode, pauses, wasEarlyFinish])

  const primaryLabel = status === 'running' ? 'Duraklat' : status === 'paused' ? 'Devam' : 'Başlat'
  const primaryAction = useCallback(() => {
    if (mode === 'deneme' && status === 'paused' && denemeBreakStartTs != null) return advanceFromDenemeBreak()
    if (status === 'running') return pause()
    if (status === 'paused') return resume()
    return start()
  }, [mode, status, denemeBreakStartTs, advanceFromDenemeBreak, pause, resume, start])

  const saveSession = async () => {
    if (!lastSessionScore) return
    const sureGercekSaniye = Math.round(elapsedMs / 1000)
    const surePlanSaniye = plannedMs != null ? Math.round(plannedMs / 1000) : undefined
    const denemeToplamPlanSaniye = mode === 'deneme' && modeConfig.mode === 'deneme'
      ? Math.round(modeConfig.bolumler.reduce((acc, bolum) => acc + bolum.surePlanMs, 0) / 1000)
      : surePlanSaniye
    const session: SessionRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      mod: mode,
      surePlan: denemeToplamPlanSaniye,
      sureGercek: sureGercekSaniye,
      puan: lastSessionScore.totalScore,
      tarihISO: new Date().toISOString(),
      not: sessionNote || undefined,
      duraklatmaSayisi: pauses,
      toplamDuraklamaSureSaniye: totalPauseDurationMs > 0 ? Math.round(totalPauseDurationMs / 1000) : undefined,
      erkenBitirmeSuresi:
        wasEarlyFinish && denemeToplamPlanSaniye != null ? Math.max(0, denemeToplamPlanSaniye - sureGercekSaniye) : undefined,
      odakSkoru: lastSessionScore.totalScore,
      molaSaniye: mode === 'ders60mola15' && molaToplamMs != null ? Math.round(molaToplamMs / 1000) : undefined,
      denemeMolalarSaniye: mode === 'deneme' ? [...(denemeMolalarSaniye ?? [])] : undefined,
      dogruSayisi: mode === 'deneme' ? denemeAnaliz?.dogru : undefined,
      yanlisSayisi: mode === 'deneme' ? denemeAnaliz?.yanlis : undefined,
      bosSayisi: mode === 'deneme' ? denemeAnaliz?.bos : undefined,
      ruhHali: sessionRuhHali ?? undefined,
    }
    try {
      await addSession(session)
      showToast(`Seans kaydedildi! +${lastSessionScore.totalScore} puan 🎉`, 'success')
      setShowFinishScreen(false)
      setSessionNote('')

      /*
       * Asenkron geçiş: ders60mola15 modunda arka planda mola başlamışsa,
       * reset yerine transitionToBreak çağrılır — mola kaldığı yerden devam eder.
       */
      const timerState = useTimerStore.getState()
      if (mode === 'ders60mola15' && timerState.backgroundBreakStartTs != null) {
        transitionToBreak()
      } else {
        reset()
      }
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }

  /* ── keyboard shortcuts ── */
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (e.code === 'Escape' && showSettings) {
        setShowSettings(false)
        return
      }
      if (e.code === settings.kısayollar.startStop) {
        e.preventDefault()
        primaryAction()
      }
      if (e.code === settings.kısayollar.reset) {
        e.preventDefault()
        reset()
      }
      if (e.code === settings.kısayollar.modGeçiş) {
        e.preventDefault()
        const modeList = ['serbest', 'gerisayim', 'ders60mola15', 'deneme'] as const
        const currentIdx = modeList.indexOf(mode as (typeof modeList)[number])
        const nextIdx = (currentIdx + 1) % modeList.length
        const nextMode = modeList[nextIdx]
        if (nextMode === 'deneme' && savedDenemeConfig) {
          setModeConfig(savedDenemeConfig)
        } else {
          setModeConfig(clonePreset(MODE_DEFAULTS[nextMode]))
        }
      }
    }
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [settings.kısayollar, status, primaryAction, reset, mode, setModeConfig, savedDenemeConfig, showSettings])

  /* ── summary ── */
  const summary = useMemo(() => {
    const totalMinutes = Math.round(todaySessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0) / 60)
    const todayCount = todaySessions.length
    const todayScore = todaySessions.reduce((acc, s) => acc + (s.puan || 0), 0)
    const streakDays = calculateStreak(sessions, todayCount > 0)

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekSessions = sessions.filter((s) => new Date(s.tarihISO) >= weekAgo)
    const weekMinutes = Math.round(weekSessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0) / 60)

    const monthAgo = new Date()
    monthAgo.setDate(monthAgo.getDate() - 30)
    const monthSessions = sessions.filter((s) => new Date(s.tarihISO) >= monthAgo)
    const monthMinutes = Math.round(monthSessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0) / 60)
    const avgScoreMonth =
      monthSessions.length > 0 ? Math.round(monthSessions.reduce((acc, s) => acc + (s.puan || 0), 0) / monthSessions.length) : 0

    const lastSessions = sessions.slice(0, 5)
    const toplamKariyerPuan = sessions.reduce((acc, s) => acc + (s.puan || 0), 0)
    const unvan = getUnvan(toplamKariyerPuan)
    const monthSeconds = monthSessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0)
    const tahmin = getTahmin150Saat(monthSeconds)

    const gunlukSnByDate: Record<string, number> = {}
    sessions.forEach((s) => {
      const d = s.tarihISO.split('T')[0]
      gunlukSnByDate[d] = (gunlukSnByDate[d] ?? 0) + (s.sureGercek ?? 0)
    })
    const gunluk5SaatGunSayisi = Object.values(gunlukSnByDate).filter((sn) => sn >= 5 * 3600).length
    const rozetler = getRozetler({ gunluk5SaatGunSayisi, streak: streakDays, toplamKariyerPuan, monthSeconds, sessions })

    return {
      todayMinutes: totalMinutes,
      todayScore,
      todaySessions: todayCount,
      streak: streakDays,
      weekMinutes,
      weekSessions: weekSessions.length,
      monthMinutes,
      monthSessions: monthSessions.length,
      avgScoreMonth,
      lastSessions,
      toplamKariyerPuan,
      unvan,
      tahmin,
      rozetler,
    }
  }, [todaySessions, sessions])

  useEffect(() => {
    document.documentElement.setAttribute('data-tier', summary.unvan.temaClass)
  }, [summary.unvan.temaClass])

  /* ── mode select handler ── */
  const handleModeSelect = useCallback(
    (modeId: 'serbest' | 'gerisayim' | 'ders60mola15' | 'deneme') => {
      if (modeId === 'deneme' && savedDenemeConfig) {
        setModeConfig(savedDenemeConfig)
      } else {
        setModeConfig(clonePreset(MODE_DEFAULTS[modeId]))
      }
      const labels: Record<string, string> = { serbest: '⏱️ Kronometre', gerisayim: '⏳ Zamanlayıcı', ders60mola15: '🍅 60/15', deneme: '📋 Deneme' }
      showToast(`${labels[modeId]} moduna geçildi`, 'info')
    },
    [savedDenemeConfig, setModeConfig, showToast],
  )

  /* ═══════════════════════ RENDER ═══════════════════════ */

  // Bitiş ekranı
  if (showFinishScreen && lastSessionScore) {
    return (
      <FinishScreen
        score={lastSessionScore}
        mode={mode}
        elapsedMs={elapsedMs}
        pauses={pauses}
        sessionNote={sessionNote}
        onSessionNoteChange={setSessionNote}
        sessionRuhHali={sessionRuhHali}
        onRuhHaliChange={setSessionRuhHali}
        denemeAnaliz={mode === 'deneme' ? denemeAnaliz : undefined}
        onDenemeAnalizChange={mode === 'deneme' ? setDenemeAnaliz : undefined}
        totalPauseDurationMs={totalPauseDurationMs}
        backgroundBreakStartTs={backgroundBreakStartTs}
        backgroundBreakPlannedMs={backgroundBreakPlannedMs}
        onSave={saveSession}
        onCancel={() => {
          setShowFinishScreen(false)
          setSessionNote('')
          setSessionRuhHali(null)
          setDenemeAnaliz(null)

          // Arka planda mola varsa break'e geç, yoksa reset
          const timerState = useTimerStore.getState()
          if (mode === 'ders60mola15' && timerState.backgroundBreakStartTs != null) {
            transitionToBreak()
          } else {
            reset()
          }
        }}
      />
    )
  }

  if (isMiniPlayerMode) {
    return (
      <div className="mini-player-drag h-screen w-full bg-surface-900 text-text-primary">
        <button
          type="button"
          data-no-drag="true"
          onClick={() => toggleMiniPlayer(false)}
          className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-text-primary/20 bg-surface-700/70 text-text-muted transition hover:border-accent-blue/60 hover:text-text-primary"
          title="Genişlet"
        >
          ↗
        </button>

        <div className="flex h-screen w-full flex-col items-center justify-center gap-3 px-3">
          <time className="font-mono text-4xl font-bold tabular-nums text-accent-blue">
            {formatDuration(timeToDisplay)}
          </time>

          <div data-no-drag="true" className="flex items-center gap-2">
            <button
              type="button"
              onClick={primaryAction}
              className="rounded-full bg-accent-blue px-4 py-1.5 text-xs font-semibold text-surface-900 transition hover:shadow-lg hover:shadow-cyan-500/30"
            >
              {primaryLabel}
            </button>

            {mode === 'ders60mola15' && workBreakPhase === 'break' ? (
              <button
                type="button"
                onClick={finishBreakEarly}
                className="rounded-full border border-emerald-500/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25"
              >
                Molayı Bitir
              </button>
            ) : (
              (status === 'running' || status === 'paused') && (
                <button
                  type="button"
                  onClick={finishEarly}
                  className="rounded-full border border-accent-amber/50 bg-accent-amber/15 px-3 py-1.5 text-xs font-semibold text-accent-amber transition hover:bg-accent-amber/25"
                >
                  Bitir
                </button>
              )
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-surface-900 text-text-primary ${isMiniPlayerMode ? 'mini-player-drag' : ''}`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 pb-16 pt-8 sm:px-8">
        {/* ════════  BÖLÜM 1 — HEADER  ════════ */}
        <DashboardHeader
          kullaniciAdi={settings.kullaniciAdi ?? ''}
          sinavTarihi={settings.sinavTarihi ?? null}
          unvanEmoji={summary.unvan.profilEmoji}
          unvanText={summary.unvan.unvan}
          onSettingsClick={() => setShowSettings(!showSettings)}
        />

        <div className="flex items-center justify-center sm:justify-end">
          <div className="inline-flex rounded-full border border-text-primary/10 bg-surface-700/50 p-1">
            <button
              type="button"
              onClick={() => setActiveView('timer')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition sm:text-sm ${
                activeView === 'timer'
                  ? 'bg-accent-blue text-surface-900'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Zamanlayıcı
            </button>
            <button
              type="button"
              onClick={() => setActiveView('analytics')}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition sm:text-sm ${
                activeView === 'analytics'
                  ? 'bg-accent-blue text-surface-900'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              İstatistikler
            </button>
          </div>
        </div>

        {activeView === 'timer' ? (
          <>
            {/* Hızlı istatistik çubuğu */}
            <QuickStatsBar
              stats={[
                { label: 'Bugün', value: formatMinutesHuman(summary.todayMinutes), hint: `${summary.todaySessions} seans`, accent: 'blue' },
                { label: 'Bu Hafta', value: formatMinutesHuman(summary.weekMinutes), hint: `${summary.weekSessions} seans`, accent: 'cyan' },
                { label: 'Seri', value: `${summary.streak}`, hint: 'ardışık gün', accent: 'amber' },
                { label: 'Puan', value: `${summary.todayScore}`, hint: 'bugün', accent: 'blue' },
              ]}
            />

            {/* ════════  BÖLÜM 2 — TIMER HERO  ════════ */}
            <TimerHero
              timeToDisplay={timeToDisplay}
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
            />

            {/* Mod seçici — Timer'ın hemen altında */}
            <ModeSelector currentMode={modeConfig.mode} onSelect={handleModeSelect} />

            {/* Mod konfigürasyon paneli (gerisayim / deneme) */}
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
            />

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
                  <span className="text-accent-blue font-semibold">{summary.toplamKariyerPuan} puan</span>
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
        ) : (
          <AnalyticsPage />
        )}

        {/* Settings Modal */}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

        {/* Global Toast */}
        <Toast
          key={toast?.key}
          message={toast?.message ?? ''}
          visible={!!toast}
          type={toast?.type ?? 'info'}
          duration={2500}
          onDismiss={() => setToast(null)}
        />
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
}) {
  if (modeConfig.mode === 'gerisayim') {
    return (
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-accent-blue/20 bg-accent-blue/5 p-5">
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
                className="w-full rounded-xl border border-text-primary/10 bg-surface-700 px-3 py-2.5 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (modeConfig.mode === 'deneme') {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-accent-amber/20 bg-accent-amber/5 p-5">
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
                    ? 'border-accent-amber/50 bg-accent-amber/10 text-text-primary font-semibold'
                    : 'border-text-primary/5 text-text-muted hover:border-accent-blue/30'
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
                    className="cursor-pointer text-xs text-accent-blue hover:text-accent-blue/80"
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
                    className="cursor-pointer text-xs text-accent-red hover:text-accent-red/80"
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
              className="w-full rounded-xl border border-text-primary/10 bg-surface-700 px-3 py-2.5 text-text-primary placeholder-text-muted focus:border-accent-blue/50 focus:outline-none"
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
                  className="w-full rounded-xl border border-text-primary/10 bg-surface-700 px-2 py-2.5 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
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
              className="flex-1 rounded-full bg-accent-amber px-4 py-2.5 text-sm font-semibold text-surface-900 hover:shadow-lg hover:shadow-amber-500/30 transition"
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
                className="rounded-full border border-text-primary/10 px-4 py-2.5 text-sm font-semibold text-text-primary hover:border-accent-blue/60 transition"
              >
                İptal
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default App
