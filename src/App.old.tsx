import { useMemo, useState, useEffect, useCallback } from 'react'
import { formatDuration } from './lib/time'
import { MODE_DEFAULTS, useTimerStore } from './store/timer'
import { useSessionsStore } from './store/sessions'
import { useSettingsStore } from './store/settings'
import { calculateScore, calculateStreak, getUnvan } from './lib/scoring'
import { getSelam, getSinavKalanGun } from './lib/selam'
import { getTahmin150Saat } from './lib/tahmin'
import { getRozetler } from './lib/rozetler'
import { initDb } from './lib/db'
import { StatCard } from './components/StatCard'
import { FinishScreen } from './components/FinishScreen'
import { SettingsModal } from './components/SettingsModal'
import type { ModeConfig, SessionRecord, RuhHali, DenemeAnaliz } from './types'

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

const modes = [
  { id: 'serbest', title: 'Kronometre' },
  { id: 'gerisayim', title: 'Zamanlayıcı' },
  { id: 'ders60mola15', title: '60 dk ders / 15 dk mola' },
  { id: 'deneme', title: 'Deneme Sınavı' },
] as const

const MODE_LABELS: Record<string, string> = {
  serbest: 'Kronometre',
  gerisayim: 'Zamanlayıcı',
  ders60mola15: '60/15',
  deneme: 'Deneme',
}
const MODE_EMOJIS: Record<string, string> = {
  serbest: '⏱️',
  gerisayim: '⏳',
  ders60mola15: '🍅',
  deneme: '📋',
}

function App() {
  const [sessionNote, setSessionNote] = useState('')
  const [sessionRuhHali, setSessionRuhHali] = useState<RuhHali | null>(null)
  const [denemeAnaliz, setDenemeAnaliz] = useState<DenemeAnaliz | null>(null)
  const [showFinishScreen, setShowFinishScreen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [lastSessionScore, setLastSessionScore] = useState<ReturnType<typeof calculateScore> | null>(null)
  const [countdownHours, setCountdownHours] = useState(0)
  const [countdownMinutes, setCountdownMinutes] = useState(10)
  const [countdownSeconds, setCountdownSeconds] = useState(0)
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

  const loadSessions = useCallback(async () => {
    try {
      await initDb()
      const state = useSessionsStore.getState()
      await state.loadSessions()
    } catch (error) {
      console.error('Failed to initialize DB:', error)
    }
  }, [])

  const sessions = useSessionsStore((s) => s.sessions)
  const addSession = useSessionsStore((s) => s.addSession)
  
  const settings = useSettingsStore()

  const todaySessions = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return sessions.filter((s) => s.tarihISO.startsWith(today))
  }, [sessions])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

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
    pauses,
    start,
    pause,
    resume,
    reset,
    setModeConfig,
    jumpToSection,
  } = useTimerStore()

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

  // Vurgu rengini CSS'e uygula
  useEffect(() => {
    const root = document.documentElement
    if (settings.vurguRengi && settings.vurguRengi !== 'mavi') {
      root.setAttribute('data-vurgu', settings.vurguRengi)
    } else {
      root.removeAttribute('data-vurgu')
    }
  }, [settings.vurguRengi])

  useEffect(() => {
    if (status === 'finished' && !showFinishScreen) {
      const elapsedMinutes = Math.round(elapsedMs / 1000 / 60)
      const plannedMinutes = plannedMs != null ? Math.round(plannedMs / 1000 / 60) : undefined
      
      // Calculate today's streak for bonus
      const sessionsState = useSessionsStore.getState()
      const streakDays = calculateStreak(sessionsState.sessions)
      
      const score = calculateScore(elapsedMinutes, mode, pauses, plannedMinutes, streakDays)
      setLastSessionScore(score)
      setShowFinishScreen(true)
      
      const settings = useSettingsStore.getState()
      const isSessiz = settings.sessizMod
      import('./lib/notifications').then(({ notifySessionComplete }) => {
        notifySessionComplete({
          enableSound: !isSessiz && settings.sesAçık,
          enableVibration: !isSessiz && settings.titreşimAçık,
          enableBrowserNotification: settings.bildirimİzni === 'granted',
          title: `Seans Tamamlandı! 🎉 (${score.totalScore} puan)`,
          body: `${MODE_LABELS[mode] ?? mode} seansınız tamamlandı.`,
        })
      })
    }
  }, [status, showFinishScreen, elapsedMs, plannedMs, mode, pauses])

  const saveSession = async () => {
    if (!lastSessionScore) return

    const session: SessionRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      mod: mode,
      surePlan: plannedMs != null ? Math.round(plannedMs / 1000) : undefined,
      sureGercek: Math.round(elapsedMs / 1000),
      puan: lastSessionScore.totalScore,
      tarihISO: new Date().toISOString(),
      not: sessionNote || undefined,
      duraklatmaSayisi: pauses,
      erkenBitirmeSuresi:
        plannedMs != null ? Math.max(0, Math.round(plannedMs / 1000) - Math.round(elapsedMs / 1000)) : undefined,
      odakSkoru: lastSessionScore.totalScore,
    }

    try {
      await addSession(session)
      setShowFinishScreen(false)
      setSessionNote('')
      reset()
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }

  const timeToDisplay = plannedMs != null ? remainingMs ?? plannedMs : elapsedMs
  const primaryLabel = status === 'running' ? 'Duraklat' : status === 'paused' ? 'Devam' : 'Başlat'
  const primaryAction = useCallback(() => {
    if (status === 'running') return pause()
    if (status === 'paused') return resume()
    return start()
  }, [status, pause, resume, start])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return
      }

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

  const summary = useMemo(() => {
    // Today's stats
    const totalMinutes = Math.round(todaySessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0) / 60)
    const todaySessions_count = todaySessions.length
    const todayScore = todaySessions.reduce((acc, s) => acc + (s.puan || 0), 0)
    
    // Calculate streak (consecutive days with sessions)
    const streakDays = calculateStreak(sessions, todaySessions.length > 0)
    
    // This week stats
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekSessions = sessions.filter(s => new Date(s.tarihISO) >= weekAgo)
    const weekMinutes = Math.round(weekSessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0) / 60)
    
    // This month stats
    const monthAgo = new Date()
    monthAgo.setDate(monthAgo.getDate() - 30)
    const monthSessions = sessions.filter(s => new Date(s.tarihISO) >= monthAgo)
    const monthMinutes = Math.round(monthSessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0) / 60)
    const avgScoreMonth = monthSessions.length > 0 
      ? Math.round(monthSessions.reduce((acc, s) => acc + (s.puan || 0), 0) / monthSessions.length)
      : 0

    // Last 5 sessions
    const lastSessions = sessions.slice(0, 5)

    // Career stats
    const toplamKariyerPuan = sessions.reduce((acc, s) => acc + (s.puan || 0), 0)
    const unvan = getUnvan(toplamKariyerPuan)
    const monthSeconds = monthSessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0)
    const tahmin = getTahmin150Saat(monthSeconds)

    // Günlük 5 saatlik gün sayısı hesapla (rozetler için)
    const gunlukSnByDate: Record<string, number> = {}
    sessions.forEach((s) => {
      const d = s.tarihISO.split('T')[0]
      gunlukSnByDate[d] = (gunlukSnByDate[d] ?? 0) + (s.sureGercek ?? 0)
    })
    const gunluk5SaatGunSayisi = Object.values(gunlukSnByDate).filter((sn) => sn >= 5 * 3600).length

    const rozetler = getRozetler({
      gunluk5SaatGunSayisi,
      streak: streakDays,
      toplamKariyerPuan,
      monthSeconds,
      sessions,
    })

    return {
      todayMinutes: totalMinutes,
      todayScore,
      todaySessions: todaySessions_count,
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

  // Ünvan tier temasını uygula
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-tier', summary.unvan.temaClass)
  }, [summary.unvan.temaClass])

  // Bitiş ekranı göster
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
        onSave={saveSession}
        onCancel={() => {
          setShowFinishScreen(false)
          setSessionNote('')
          setSessionRuhHali(null)
          setDenemeAnaliz(null)
          reset()
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-surface-900 text-text-primary">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-10 pt-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-text-muted">{getSelam(settings.kullaniciAdi ?? '')}</p>
            <h1 className="font-display text-3xl font-semibold text-text-primary">
              {summary.unvan.profilEmoji} {summary.unvan.unvan}
            </h1>
            {settings.sinavTarihi && (() => {
              const kalan = getSinavKalanGun(settings.sinavTarihi)
              return kalan != null && kalan > 0 ? (
                <p className="text-sm text-accent-amber mt-1">📅 Sınava <span className="font-semibold">{kalan}</span> gün kaldı</p>
              ) : kalan === 0 ? (
                <p className="text-sm text-accent-red mt-1 font-semibold">🔥 Sınav bugün! Başarılar!</p>
              ) : null
            })()}
          </div>
          <div className="flex gap-3 items-center text-sm text-text-muted">
            <div className="flex gap-3">
              <span className="rounded-full bg-text-primary/5 px-3 py-1 border border-text-primary/10">PWA hazır taslak</span>
              <span className="rounded-full bg-text-primary/5 px-3 py-1 border border-text-primary/10">Offline-first</span>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-full bg-accent-blue/10 hover:bg-accent-blue/20 p-2 border border-accent-blue/30 hover:border-accent-blue/60 transition text-accent-blue"
              title="Ayarlar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Bugün" value={`${summary.todayMinutes} dk`} hint={`${summary.todaySessions} seans`} />
          <StatCard label="Bu Hafta" value={`${summary.weekMinutes} dk`} hint={`${summary.weekSessions} seans`} />
          <StatCard label="Seri" value={`${summary.streak} gün`} hint="Ardışık gün" />
        </section>

        {/* Statistics Section */}
        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            {/* Session List */}
            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-cyan-500/5">
              <div className="mb-4">
                <p className="text-xs uppercase tracking-widest text-text-muted">Son Seanslar</p>
                <h3 className="font-display text-lg text-text-primary">Özetiniz</h3>
              </div>
              
              <div className="space-y-3">
                {summary.lastSessions.length > 0 ? (
                  summary.lastSessions.map((session) => (
                    <div key={session.id} className="flex items-center justify-between rounded-lg border border-text-primary/10 bg-surface-900/50 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-accent-blue">
                            {MODE_EMOJIS[session.mod] ?? '📋'}
                          </span>
                          <span className="text-xs text-text-muted truncate">
                            {MODE_LABELS[session.mod] ?? session.mod}
                          </span>
                          <span className="text-xs text-text-muted">
                            {new Date(session.tarihISO).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-text-primary font-semibold">{Math.round(session.sureGercek / 60)} dk</span>
                          <span className="rounded-full bg-accent-blue/20 px-2 py-0.5 text-xs font-semibold text-accent-blue">
                            +{session.puan} puan
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-2 text-center text-sm text-text-muted">Henüz seans kaydı yok</p>
                )}
              </div>
            </div>

            {/* Statistics Cards */}
            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-amber-500/5">
              <div className="mb-4">
                <p className="text-xs uppercase tracking-widest text-text-muted">Bu Ay</p>
                <h3 className="font-display text-lg text-text-primary">İstatistikler</h3>
              </div>
              
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">Toplam Süre</span>
                  <span className="font-semibold text-text-primary">{summary.monthMinutes} dakika</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">Tamamlanan Seans</span>
                  <span className="font-semibold text-accent-amber">{summary.monthSessions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-muted">Ort. Puan</span>
                  <span className="font-semibold text-accent-cyan">{summary.avgScoreMonth}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-text-primary/10">
                  <span className="text-sm text-text-muted">Günlük Ort.</span>
                  <span className="font-semibold text-accent-blue">
                    {summary.monthSessions > 0 ? Math.round(summary.monthMinutes / summary.monthSessions) : 0} dk
                  </span>
                </div>
              </dl>
            </div>
          <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-cyan-500/5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-text-muted">Mod Seçimi</p>
                <h2 className="font-display text-xl text-text-primary">Nasıl çalışmak istiyorsun?</h2>
              </div>
              <span className="rounded-full bg-accent-blue/20 px-3 py-1 text-xs font-medium text-accent-blue">
                Klavye: m / space / r
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => {
                    if (mode.id === 'deneme' && savedDenemeConfig) {
                      setModeConfig(savedDenemeConfig)
                    } else {
                      setModeConfig(clonePreset(MODE_DEFAULTS[mode.id]))
                    }
                  }}
                  className={`group rounded-card border px-3 py-3 text-left transition hover:-translate-y-[1px] hover:border-accent-blue/60 hover:shadow-lg hover:shadow-accent-blue/10 ${
                    modeConfig.mode === mode.id
                      ? 'border-accent-blue/70 bg-text-primary/5'
                      : 'border-text-primary/10 bg-text-primary/0'
                  }`}
                >
                  <p className="font-semibold text-text-primary">{mode.title}</p>
                </button>
              ))}
            </div>

              {modeConfig.mode === 'gerisayim' && (
                <div className="mt-4 rounded-card border border-accent-blue/30 bg-accent-blue/5 p-4">
                  <p className="mb-4 text-sm font-semibold text-text-primary">Zamanlayıcı Süresi</p>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-2 block text-xs text-text-muted">Saat</label>
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={countdownHours}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(23, parseInt(e.target.value) || 0))
                          setCountdownHours(val)
                          setModeConfig({
                            mode: 'gerisayim',
                            sureMs: (val * 3600 + countdownMinutes * 60 + countdownSeconds) * 1000,
                          })
                        }}
                        className="w-full rounded-card border border-text-primary/10 bg-surface-700 px-3 py-2 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-2 block text-xs text-text-muted">Dakika</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={countdownMinutes}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0))
                          setCountdownMinutes(val)
                          setModeConfig({
                            mode: 'gerisayim',
                            sureMs: (countdownHours * 3600 + val * 60 + countdownSeconds) * 1000,
                          })
                        }}
                        className="w-full rounded-card border border-text-primary/10 bg-surface-700 px-3 py-2 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-2 block text-xs text-text-muted">Saniye</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={countdownSeconds}
                        onChange={(e) => {
                          const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0))
                          setCountdownSeconds(val)
                          setModeConfig({
                            mode: 'gerisayim',
                            sureMs: (countdownHours * 3600 + countdownMinutes * 60 + val) * 1000,
                          })
                        }}
                        className="w-full rounded-card border border-text-primary/10 bg-surface-700 px-3 py-2 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {modeConfig.mode === 'deneme' && (
                <div className="mt-4 rounded-card border border-accent-amber/30 bg-accent-amber/5 p-4">
                  <p className="mb-4 text-sm font-semibold text-text-primary">Sınav Bölümleri</p>
                  
                  <div className="mb-4 space-y-3 rounded-lg bg-surface-900/50 p-3">
                    {modeConfig.bolumler.map((bolum, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg bg-surface-800/50 px-3 py-2">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-text-primary">{bolum.ad}</p>
                          <p className="text-xs text-text-muted">
                            {Math.floor(bolum.surePlanMs / 60000)} dk
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSectionName(bolum.ad)
                              setSectionHours(Math.floor(bolum.surePlanMs / 3600000))
                              setSectionMinutes(Math.floor((bolum.surePlanMs % 3600000) / 60000))
                              setSectionSeconds(Math.floor((bolum.surePlanMs % 60000) / 1000))
                              setEditingSectionIndex(idx)
                            }}
                            className="rounded px-2 py-1 text-xs font-semibold text-accent-blue hover:bg-accent-blue/20"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => {
                              const newBolumler = modeConfig.bolumler.filter((_, i) => i !== idx)
                              setModeConfig({
                                ...modeConfig,
                                bolumler: newBolumler.length > 0 ? newBolumler : [{ ad: 'Bölüm 1', surePlanMs: 30 * 60 * 1000 }]
                              })
                            }}
                            className="rounded px-2 py-1 text-xs font-semibold text-accent-red hover:bg-accent-red/20"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-3 rounded-lg border border-text-primary/10 bg-surface-900/30 p-3">
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-text-primary">Bölüm Adı</label>
                      <input
                        type="text"
                        value={sectionName}
                        onChange={(e) => setSectionName(e.target.value)}
                        placeholder="ör. Türkçe, Matematik..."
                        className="w-full rounded-card border border-text-primary/10 bg-surface-700 px-3 py-2 text-text-primary placeholder-text-muted focus:border-accent-blue/50 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="mb-2 block text-xs text-text-muted">Saat</label>
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={sectionHours}
                          onChange={(e) => setSectionHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                          className="w-full rounded-card border border-text-primary/10 bg-surface-700 px-2 py-2 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs text-text-muted">Dakika</label>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={sectionMinutes}
                          onChange={(e) => setSectionMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                          className="w-full rounded-card border border-text-primary/10 bg-surface-700 px-2 py-2 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs text-text-muted">Saniye</label>
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={sectionSeconds}
                          onChange={(e) => setSectionSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                          className="w-full rounded-card border border-text-primary/10 bg-surface-700 px-2 py-2 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
                        />
                      </div>
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
                              setModeConfig({
                                ...modeConfig,
                                bolumler: [...modeConfig.bolumler, { ad: sectionName, surePlanMs }]
                              })
                            }
                            setSectionName('')
                            setSectionHours(0)
                            setSectionMinutes(30)
                            setSectionSeconds(0)
                          }
                        }}
                        className="flex-1 rounded-full bg-accent-amber px-4 py-2 text-sm font-semibold text-surface-900 hover:shadow-lg hover:shadow-amber-500/30"
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
                          className="rounded-full border border-text-primary/10 px-4 py-2 text-sm font-semibold text-text-primary hover:border-accent-blue/60"
                        >
                          İptal
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-[0.9fr_0.65fr]">
              <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-5 shadow-lg shadow-blue-500/5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg text-text-primary">Sayaç</h3>
                    {mode === 'ders60mola15' && (
                      <span className="rounded-full bg-accent-amber/20 px-2 py-1 text-[11px] font-semibold text-accent-amber">
                        {workBreakPhase === 'break' ? 'Mola' : 'Çalışma'} • Tur {((dersCycle ?? 0) + 1).toString()}
                      </span>
                    )}
                  </div>
                  <span className="rounded-full bg-text-primary/5 px-2 py-1 text-xs text-text-muted">Taslak</span>
                </div>
                <div className="flex flex-col items-center gap-4 py-4">
                  <div className="font-display text-6xl tracking-tight text-text-primary">{formatDuration(timeToDisplay)}</div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-full bg-accent-blue px-4 py-2 text-sm font-semibold text-surface-900 shadow-lg shadow-cyan-500/30"
                      onClick={primaryAction}
                    >
                      {primaryLabel}
                    </button>
                    <button
                      className="rounded-full border border-text-primary/10 px-4 py-2 text-sm text-text-primary"
                      onClick={() => reset()}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-5 shadow-lg shadow-amber-500/5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg text-text-primary">Bölümler / Notlar</h3>
                  <span className="rounded-full bg-accent-amber/20 px-2 py-1 text-xs text-accent-amber">Deneme modu</span>
                </div>
                <SectionList
                  modeConfig={modeConfig}
                  currentSectionIndex={currentSectionIndex}
                  jumpToSection={jumpToSection}
                />
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-blue-500/5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg text-text-primary">Bugün</h3>
                <span className="text-xs text-text-muted">{todaySessions.length} seans</span>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Toplam Süre</span>
                  <span className="font-semibold text-accent-blue">{summary.todayMinutes} dk</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Toplam Puan</span>
                  <span className="font-semibold text-accent-amber">{summary.todayScore}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-text-primary/10">
                  <span className="text-text-muted">Ort. / Seans</span>
                  <span className="font-semibold text-accent-cyan">
                    {summary.todaySessions > 0 ? Math.round(summary.todayScore / summary.todaySessions) : 0} puan
                  </span>
                </div>
              </dl>
            </div>

            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-amber-500/5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg text-text-primary">Bu Ay Hedefleri</h3>
                <span className="text-xs text-text-muted">{summary.monthSessions}/{Math.ceil(30 / 5)} hafta</span>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-text-muted">Seans Hedefi</span>
                    <span className="text-xs font-semibold text-text-primary">{summary.monthSessions} / 30</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-accent-blue to-accent-cyan transition-all"
                      style={{ width: `${Math.min((summary.monthSessions / 30) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-text-muted">Süre Hedefi</span>
                    <span className="text-xs font-semibold text-text-primary">{summary.monthMinutes} / 1200 dk</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-accent-amber to-accent-red transition-all"
                      style={{ width: `${Math.min((summary.monthMinutes / 1200) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-purple-500/5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg text-text-primary">Kariyer</h3>
                <span className="text-xs text-text-muted">{summary.toplamKariyerPuan} puan</span>
              </div>
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{summary.unvan.profilEmoji}</span>
                  <div>
                    <p className="font-semibold text-text-primary">{summary.unvan.unvan}</p>
                    {summary.unvan.sonrakiUnvan && (
                      <p className="text-xs text-text-muted">Sonraki: {summary.unvan.sonrakiUnvan} ({summary.unvan.sonrakiPuan} puan)</p>
                    )}
                  </div>
                </div>
                {summary.unvan.ilerlemeYuzde != null && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-muted">İlerleme</span>
                      <span className="text-xs font-semibold text-accent-blue">%{summary.unvan.ilerlemeYuzde}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-accent-blue to-accent-cyan transition-all"
                        style={{ width: `${summary.unvan.ilerlemeYuzde}%` }}
                      />
                    </div>
                  </div>
                )}
                {summary.tahmin && (
                  <p className="text-xs text-text-muted mt-2">💡 {summary.tahmin}</p>
                )}
              </div>
            </div>

            {/* Rozetler */}
            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-amber-500/5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg text-text-primary">Rozetler</h3>
                <span className="text-xs text-text-muted">
                  {summary.rozetler.filter(r => r.kazanildi).length}/{summary.rozetler.length}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {summary.rozetler.map((rozet) => (
                  <div
                    key={rozet.id}
                    className={`flex flex-col items-center rounded-lg p-2 text-center transition ${
                      rozet.kazanildi
                        ? 'bg-accent-amber/10 border border-accent-amber/30'
                        : 'bg-surface-700/30 border border-text-primary/5 opacity-40'
                    }`}
                    title={rozet.aciklama}
                  >
                    <span className="text-xl">{rozet.emoji}</span>
                    <span className="text-[10px] text-text-muted mt-1 leading-tight">{rozet.ad}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-green-500/5">
              <h3 className="font-display text-lg text-text-primary">Ayarlar (özet)</h3>
              <ul className="mt-3 space-y-2 text-sm text-text-muted">
                <li>Ses: {settings.sesAçık ? 'açık ✓' : 'kapalı ✗'} • Titreşim: {settings.titreşimAçık ? 'açık ✓' : 'kapalı ✗'}</li>
                <li>Tema: {settings.tema === 'dark' ? 'koyu' : settings.tema === 'light' ? 'açık' : 'yüksek kontrast'}</li>
                <li><button onClick={() => setShowSettings(true)} className="text-accent-blue hover:text-accent-blue/80">Detaylı ayarları aç →</button></li>
              </ul>
            </div>
          </aside>
        </section>

        {/* Settings Modal */}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  )
}

function SectionList({
  modeConfig,
  currentSectionIndex,
  jumpToSection,
}: {
  modeConfig: ModeConfig
  currentSectionIndex?: number
  jumpToSection: (idx: number) => void
}) {
  if (modeConfig.mode !== 'deneme') {
    return <p className="mt-3 text-sm text-text-muted">Bu alan deneme modunda bölüm sürelerini gösterecek.</p>
  }

  const { bolumler } = modeConfig
  const activeIdx = currentSectionIndex ?? modeConfig.currentSectionIndex ?? 0
  return (
    <div className="mt-3">
      <div className="space-y-2">
        {bolumler.map((b, idx) => (
          <button
            key={b.ad + idx}
            onClick={() => jumpToSection(idx)}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
              idx === activeIdx 
                ? 'border-accent-amber/60 bg-accent-amber/10 text-text-primary font-semibold' 
                : 'border-text-primary/5 bg-text-primary/0 text-text-muted hover:border-accent-blue/40 hover:bg-text-primary/5'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{b.ad}</span>
              <span className={idx === activeIdx ? 'text-accent-amber font-semibold' : ''}>{Math.round(b.surePlanMs / 60000)} dk</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default App
