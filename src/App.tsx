import { useMemo, useState, useEffect, useCallback, useRef, lazy, Suspense, memo } from 'react'
import { formatDuration } from './lib/time'
import { MODE_DEFAULTS, useTimerStore } from './store/timer'
import { useSessionsStore } from './store/sessions'
import { useSettingsStore } from './store/settings'
import { calculateScore, getUnvan } from './lib/scoring'
import { initDb } from './lib/db'
import { getSelam, getSinavKalanGun } from './lib/selam'
import { getRandomMolaFikri } from './lib/molaFikirleri'
import { getRozetler } from './lib/rozetler'
import { getTahmin150Saat, getSaatDagilimi } from './lib/tahmin'
import { StatCard } from './components/StatCard'
import { Toast } from './components/Toast'
import { Confetti } from './components/Confetti'
import type { ModeConfig, SessionRecord } from './types'

const FinishScreen = lazy(() => import('./components/FinishScreen').then((m) => ({ default: m.FinishScreen })))
const SettingsModal = lazy(() => import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal })))

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

/** Önem sırasına göre: Deneme → 60/15 → Zamanlayıcı → Kronometre */
const modes = [
  { id: 'deneme', title: 'Deneme Sınavı' },
  { id: 'ders60mola15', title: '60 dk ders / 15 dk mola' },
  { id: 'gerisayim', title: 'Zamanlayıcı' },
  { id: 'serbest', title: 'Kronometre' },
] as const

function App() {
  const [sessionNote, setSessionNote] = useState('')
  const [showFinishScreen, setShowFinishScreen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMotivasyon, setShowMotivasyon] = useState(false)
  const [showLevelUp, setShowLevelUp] = useState<{ unvan: string; emoji: string } | null>(null)
  const [lastSessionScore, setLastSessionScore] = useState<ReturnType<typeof calculateScore> | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'celebration' } | null>(null)
  const [showConfetti, setShowConfetti] = useState(false)
  const [sessionRuhHali, setSessionRuhHali] = useState<import('./types').RuhHali | null>(null)
  const onceConfettiRef = useRef(false)
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

  const tema = useSettingsStore((s) => s.tema)
  const sesAçık = useSettingsStore((s) => s.sesAçık)
  const titreşimAçık = useSettingsStore((s) => s.titreşimAçık)
  const sessizMod = useSettingsStore((s) => s.sessizMod)
  const kısayollar = useSettingsStore((s) => s.kısayollar)
  const kullaniciAdi = useSettingsStore((s) => s.kullaniciAdi ?? '')
  const sinavTarihi = useSettingsStore((s) => s.sinavTarihi ?? null)
  const vurguRengi = useSettingsStore((s) => s.vurguRengi ?? 'mavi')

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
    molaToplamMs,
    denemeBreakStartTs,
    denemeMolalarDakika,
    pauses,
    start,
    pause,
    resume,
    reset,
    setModeConfig,
    jumpToSection,
    advanceFromDenemeBreak,
  } = useTimerStore()

  useEffect(() => {
    if (modeConfig?.mode === 'deneme') {
      setSavedDenemeConfig(modeConfig)
      localStorage.setItem('deneme-config', JSON.stringify(modeConfig))
    }
  }, [modeConfig])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', tema)
    if (tema === 'light') {
      root.classList.add('light-theme')
      root.classList.remove('dark-theme', 'high-contrast-theme')
    } else if (tema === 'high-contrast') {
      root.classList.add('high-contrast-theme')
      root.classList.remove('dark-theme', 'light-theme')
    } else {
      root.classList.add('dark-theme')
      root.classList.remove('light-theme', 'high-contrast-theme')
    }
  }, [tema])

  const unvanTemaClass = useMemo(
    () => getUnvan(sessions.reduce((a, s) => a + (s.puan ?? 0), 0)).temaClass,
    [sessions]
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-tier', unvanTemaClass)
    return () => document.documentElement.removeAttribute('data-tier')
  }, [unvanTemaClass])

  useEffect(() => {
    document.documentElement.setAttribute('data-vurgu', vurguRengi)
  }, [vurguRengi])

  useEffect(() => {
    if (status === 'finished' && !showFinishScreen) {
      if (!onceConfettiRef.current) {
        setShowConfetti(true)
        onceConfettiRef.current = true
      }
      const elapsedMinutes = Math.round(elapsedMs / 1000 / 60)
      const plannedMinutes = plannedMs != null ? Math.round(plannedMs / 1000 / 60) : undefined
      
      // Calculate today's streak for bonus
      const sessionsState = useSessionsStore.getState()
      const today = new Date().toISOString().split('T')[0]
      let streakDays = 1
      
      // Check previous days for streak
      let checkDate = new Date(today)
      for (let i = 1; i <= 60; i++) {
        checkDate.setDate(checkDate.getDate() - 1)
        const checkDateStr = checkDate.toISOString().split('T')[0]
        const hasSessions = sessionsState.sessions.some(s => s.tarihISO.startsWith(checkDateStr))
        if (hasSessions) {
          streakDays++
        } else {
          break
        }
      }
      
      const score = calculateScore(elapsedMinutes, mode, pauses, plannedMinutes, streakDays)
      setLastSessionScore(score)
      setShowFinishScreen(true)
      
      const settings = useSettingsStore.getState()
      import('./lib/notifications').then(({ notifySessionComplete }) => {
        notifySessionComplete({
          enableSound: settings.sessizMod ? false : settings.sesAçık,
          enableVibration: settings.titreşimAçık,
          enableBrowserNotification: settings.bildirimİzni === 'granted',
          title: `Seans Tamamlandı! 🎉 (${score.totalScore} puan)`,
          body: `${mode === 'serbest' ? 'Kronometre' : mode === 'gerisayim' ? 'Zamanlayıcı' : mode === 'ders60mola15' ? '60 dk ders / 15 dk mola' : 'Deneme Sınavı'} seansınız tamamlandı.`,
        })
      })
    }
  }, [status, showFinishScreen, elapsedMs, plannedMs, mode, pauses])

  const saveSession = async () => {
    if (!lastSessionScore) return

    const session: SessionRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      mod: mode,
      surePlan: plannedMs != null ? Math.round(plannedMs / 1000 / 60) : undefined,
      sureGercek: Math.round(elapsedMs / 1000 / 60),
      puan: lastSessionScore.totalScore,
      tarihISO: new Date().toISOString(),
      not: sessionNote || undefined,
      duraklatmaSayisi: pauses,
      erkenBitirmeSuresi:
        plannedMs != null ? Math.max(0, Math.round(plannedMs / 1000 / 60) - Math.round(elapsedMs / 1000 / 60)) : undefined,
      odakSkoru: lastSessionScore.totalScore,
      molaDakika: mode === 'ders60mola15' && molaToplamMs != null ? Math.round(molaToplamMs / 60000) : undefined,
      denemeMolalarDakika: mode === 'deneme' && denemeMolalarDakika?.length ? [...denemeMolalarDakika] : undefined,
      ruhHali: sessionRuhHali ?? undefined,
    }

    try {
      const toplamÖnce = sessions.reduce((a, s) => a + (s.puan ?? 0), 0)
      await addSession(session)
      onceConfettiRef.current = false
      const toplamSonra = toplamÖnce + lastSessionScore.totalScore
      const unvanÖnce = getUnvan(toplamÖnce).unvan
      const unvanSonra = getUnvan(toplamSonra)
      if (unvanSonra.unvan !== unvanÖnce) {
        setShowLevelUp({ unvan: unvanSonra.unvan, emoji: unvanSonra.profilEmoji })
      }
      const bugunToplam = todaySessions.reduce((a, s) => a + (s.sureGercek ?? 0), 0) + session.sureGercek
      if (bugunToplam >= 300) {
        setToast({ message: 'Harikasın! 5 saatlik günü tamamladın 🎉', type: 'celebration' })
      }
      setShowFinishScreen(false)
      setSessionNote('')
      setSessionRuhHali(null)
      reset()
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }

  const timeToDisplay = plannedMs != null ? remainingMs ?? plannedMs : elapsedMs
  const denemeMolada = mode === 'deneme' && status === 'paused' && denemeBreakStartTs != null
  const [molaTick, setMolaTick] = useState(0)
  useEffect(() => {
    if (!denemeMolada) return
    const id = setInterval(() => setMolaTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [denemeMolada])
  const molaDk = useMemo(
    () => (denemeMolada && denemeBreakStartTs != null ? Math.round((performance.now() - denemeBreakStartTs) / 60000) : 0),
    [denemeMolada, denemeBreakStartTs, molaTick]
  )

  const primaryLabel = denemeMolada ? 'Devam' : status === 'running' ? 'Duraklat' : status === 'paused' ? 'Devam' : 'Başlat'
  const primaryAction = useCallback(() => {
    if (denemeMolada) return advanceFromDenemeBreak()
    if (status === 'running') return pause()
    if (status === 'paused') return resume()
    return start()
  }, [denemeMolada, advanceFromDenemeBreak, status, pause, resume, start])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return
      }

      if (e.code === 'Escape' && showSettings) {
        setShowSettings(false)
        return
      }

      if (e.code === kısayollar.startStop) {
        e.preventDefault()
        primaryAction()
      }
      if (e.code === kısayollar.reset) {
        e.preventDefault()
        reset()
      }
      if (e.code === kısayollar.modGeçiş) {
        e.preventDefault()
        const modeList = ['deneme', 'ders60mola15', 'gerisayim', 'serbest'] as const
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
  }, [kısayollar, primaryAction, reset, mode, setModeConfig, savedDenemeConfig, showSettings])

  const summary = useMemo(() => {
    // Today's stats
    const totalMinutes = todaySessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0)
    const todaySessions_count = todaySessions.length
    const todayScore = todaySessions.reduce((acc, s) => acc + (s.puan || 0), 0)
    
    // Calculate streak (consecutive days with sessions)
    const today = new Date().toISOString().split('T')[0]
    let streakDays = 0
    let checkDate = new Date(today)
    
    // Check if today has sessions
    if (todaySessions.length > 0) {
      streakDays = 1
      // Check previous days (max 60 gün)
      for (let i = 1; i <= 60; i++) {
        checkDate.setDate(checkDate.getDate() - 1)
        const checkDateStr = checkDate.toISOString().split('T')[0]
        const hasSessions = sessions.some(s => s.tarihISO.startsWith(checkDateStr))
        if (hasSessions) {
          streakDays++
        } else {
          break
        }
      }
    }
    
    // This week stats
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekSessions = sessions.filter(s => new Date(s.tarihISO) >= weekAgo)
    const weekMinutes = weekSessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0)
    
    // This month stats
    const monthAgo = new Date()
    monthAgo.setDate(monthAgo.getDate() - 30)
    const monthSessions = sessions.filter(s => new Date(s.tarihISO) >= monthAgo)
    const monthMinutes = monthSessions.reduce((acc, s) => acc + (s.sureGercek || 0), 0)
    const avgScoreMonth = monthSessions.length > 0 
      ? Math.round(monthSessions.reduce((acc, s) => acc + (s.puan || 0), 0) / monthSessions.length)
      : 0

    // Bu ay günde 5+ saat (300 dk) çalışılan gün sayısı
    const HEDEF_SAAT_GUN = 5
    const HEDEF_DK = HEDEF_SAAT_GUN * 60
    const gunlukDakikaByDate: Record<string, number> = {}
    monthSessions.forEach((s) => {
      const dateStr = s.tarihISO.split('T')[0]
      gunlukDakikaByDate[dateStr] = (gunlukDakikaByDate[dateStr] ?? 0) + (s.sureGercek || 0)
    })
    const gunluk5SaatGunSayisi = Object.values(gunlukDakikaByDate).filter((dk) => dk >= HEDEF_DK).length

    // Son 30 gün, günde toplam dakika (grafik için; en soldaki = 30 gün önce)
    const gunlukSon30Gun: { date: string; dakika: number }[] = []
    const baslangic = new Date(today)
    for (let i = 29; i >= 0; i--) {
      const d = new Date(baslangic)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      gunlukSon30Gun.push({ date: dateStr, dakika: gunlukDakikaByDate[dateStr] ?? 0 })
    }

    // Last 5 sessions
    const lastSessions = sessions.slice(0, 5)

    // Kariyer puanı → ünvan (tüm seansların puan toplamı)
    const toplamKariyerPuan = sessions.reduce((a, s) => a + (s.puan ?? 0), 0)
    const unvanBilgisi = getUnvan(toplamKariyerPuan)

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
      gunluk5SaatGunSayisi,
      gunlukSon30Gun,
      lastSessions,
      toplamKariyerPuan,
      unvanBilgisi,
    }
  }, [todaySessions, sessions])

  const molaFikri = useMemo(() => {
    if (denemeMolada || (mode === 'ders60mola15' && workBreakPhase === 'break')) return getRandomMolaFikri()
    return null
  }, [denemeMolada, mode, workBreakPhase])
  const rozetler = useMemo(
    () =>
      getRozetler({
        gunluk5SaatGunSayisi: summary.gunluk5SaatGunSayisi,
        streak: summary.streak,
        toplamKariyerPuan: summary.toplamKariyerPuan,
        monthMinutes: summary.monthMinutes,
        sessions,
      }),
    [summary.gunluk5SaatGunSayisi, summary.streak, summary.toplamKariyerPuan, summary.monthMinutes, sessions]
  )
  const saatDagilimi = useMemo(() => getSaatDagilimi(sessions), [sessions])

  if (showFinishScreen && lastSessionScore) {
    return (
      <>
        <Confetti active={showConfetti} onDone={() => setShowConfetti(false)} />
        <Suspense fallback={<div className="min-h-screen bg-surface-900 flex items-center justify-center" aria-hidden>Yükleniyor…</div>}>
          <FinishScreen
        score={lastSessionScore}
        mode={mode}
        elapsedMs={elapsedMs}
        pauses={pauses}
        sessionNote={sessionNote}
        onSessionNoteChange={setSessionNote}
        onSave={saveSession}
        sessionRuhHali={sessionRuhHali}
        onRuhHaliChange={setSessionRuhHali}
        onCancel={() => {
          onceConfettiRef.current = false
          setShowFinishScreen(false)
          setSessionNote('')
          setSessionRuhHali(null)
          reset()
        }}
      />
        </Suspense>
        {toast && <Toast message={toast.message} visible onDismiss={() => setToast(null)} type={toast.type} />}
      </>
    )
  }

  const selam = getSelam(kullaniciAdi)
  const sinavKalan = getSinavKalanGun(sinavTarihi)
  const tahminMetni = getTahmin150Saat(summary.monthMinutes)
  const seriAlev = summary.streak >= 14 ? '🔥🔥🔥' : summary.streak >= 7 ? '🔥🔥' : summary.streak >= 3 ? '🔥' : ''

  return (
    <div className="min-h-screen min-h-[100dvh] bg-surface-900 text-text-primary">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:gap-6 px-3 sm:px-4 pb-6 sm:pb-10 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-10">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-widest text-text-muted">Zaman Ölçer</p>
            <h1 className="font-display text-3xl font-semibold text-text-primary">{selam}</h1>
            <p className="text-sm text-text-muted mt-0.5">Deneme / Çalışma Süreçleri</p>
          </div>
          <div className="flex flex-wrap gap-3 items-center text-sm text-text-muted">
            {/* Profil (puana göre görsel) + Ünvan; tıklanınca motivasyon penceresi */}
            <button
              type="button"
              onClick={() => setShowMotivasyon(true)}
              className="flex items-center gap-3 rounded-card border border-accent-amber/30 bg-accent-amber/5 px-4 py-2 min-w-[180px] text-left hover:bg-accent-amber/10 hover:border-accent-amber/50 transition focus:outline-none focus:ring-2 focus:ring-accent-amber/50"
              title="Motivasyon ve ilerideki ünvanlar"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-700/80 text-xl ring-2 ring-accent-amber/40" aria-hidden>
                {summary.unvanBilgisi.profilEmoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider text-text-muted">Ünvan</p>
                <p className="font-display text-lg font-semibold text-accent-amber truncate">{summary.unvanBilgisi.unvan}</p>
                <p className="text-xs text-text-muted">{summary.toplamKariyerPuan} puan</p>
                {summary.unvanBilgisi.sonrakiUnvan != null && summary.unvanBilgisi.ilerlemeYuzde != null && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-text-muted">
                      <span>→ {summary.unvanBilgisi.sonrakiUnvan}</span>
                      <span>{summary.unvanBilgisi.ilerlemeYuzde}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-700 overflow-hidden mt-0.5">
                      <div
                        className="h-full bg-gradient-to-r from-accent-amber to-accent-cyan transition-all"
                        style={{ width: `${summary.unvanBilgisi.ilerlemeYuzde}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </button>
            <div className="hidden sm:flex gap-2">
              <span className="rounded-full bg-text-primary/5 px-2 py-1 text-xs border border-text-primary/10">PWA</span>
              <span className="rounded-full bg-text-primary/5 px-2 py-1 text-xs border border-text-primary/10">Offline</span>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="rounded-full bg-accent-blue/10 hover:bg-accent-blue/20 active:bg-accent-blue/30 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center border border-accent-blue/30 hover:border-accent-blue/60 transition text-accent-blue touch-manipulation"
              title="Ayarlar"
              aria-label="Ayarlar"
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Ana odak: büyük sayaç ve modlar */}
        <section className="mt-4 flex flex-col items-center gap-4">
          {/* Sayaç */}
          <div className="w-full max-w-xl rounded-card border border-text-primary/5 bg-surface-800/80 p-6 shadow-xl shadow-blue-500/20">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-xl sm:text-2xl text-text-primary">Sayaç</h3>
                {denemeMolada && (
                  <span className="rounded-full bg-accent-amber/20 px-2 py-1 text-[11px] font-semibold text-accent-amber">
                    Bölüm arası mola
                  </span>
                )}
                {mode === 'ders60mola15' && !denemeMolada && (
                  <span className="rounded-full bg-accent-amber/20 px-2 py-1 text-[11px] font-semibold text-accent-amber">
                    {workBreakPhase === 'break' ? 'Mola' : 'Ders'} • Tur {((dersCycle ?? 0) + 1).toString()}
                  </span>
                )}
              </div>
              <span className="rounded-full bg-text-primary/5 px-2 py-1 text-xs text-text-muted">Ana odak</span>
            </div>
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="font-display text-6xl sm:text-7xl tracking-tight text-text-primary">
                {denemeMolada ? formatDuration(molaDk * 60000) : formatDuration(timeToDisplay)}
              </div>
              {denemeMolada && (
                <p className="text-center text-sm text-text-muted">
                  Analiz / mola süresi kaydediliyor. Hazır olunca Devam’a bas.
                </p>
              )}
              {molaFikri && (
                <div className="rounded-lg border border-accent-amber/30 bg-accent-amber/5 px-4 py-2 text-sm text-text-primary">
                  <span className="text-accent-amber font-semibold">Mola fikri:</span> {molaFikri}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  className="rounded-full bg-accent-blue px-5 py-3 min-h-[44px] text-sm font-semibold text-surface-900 shadow-lg shadow-cyan-500/30 active:scale-[0.97] transition touch-manipulation"
                  onClick={primaryAction}
                >
                  {primaryLabel}
                </button>
                {!denemeMolada && (
                  <button
                    type="button"
                    className="rounded-full border border-text-primary/10 px-5 py-3 min-h-[44px] text-sm text-text-primary active:scale-[0.97] transition touch-manipulation"
                    onClick={() => reset()}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Mod seçimi + (denemede) Bölümler/Notlar sağda */}
          <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-4 items-stretch">
            <div className="flex-1 min-w-0 rounded-card border border-text-primary/5 bg-surface-800/80 p-5 shadow-lg shadow-cyan-500/10">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-text-muted">Mod Seçimi</p>
                <h2 className="font-display text-xl text-text-primary">Nasıl çalışmak istiyorsun?</h2>
              </div>
              <span className="self-start rounded-full bg-accent-blue/20 px-3 py-1 text-xs font-medium text-accent-blue">
                Klavye: m / space / r
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  className={`group rounded-card border px-3 py-3 min-h-[44px] text-left transition touch-manipulation hover:-translate-y-[1px] hover:border-accent-blue/60 hover:shadow-lg hover:shadow-accent-blue/10 active:bg-text-primary/5 ${
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
                <div className="flex flex-col gap-3 sm:flex-row">
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
            {modeConfig.mode === 'deneme' && (
              <div className="w-full lg:w-72 shrink-0 rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-amber-500/5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display text-lg text-text-primary">Bölümler / Notlar</h3>
                  <span className="rounded-full bg-accent-amber/20 px-2 py-1 text-xs text-accent-amber">Deneme</span>
                </div>
                <SectionList
                  modeConfig={modeConfig}
                  currentSectionIndex={currentSectionIndex}
                  jumpToSection={jumpToSection}
                />
              </div>
            )}
          </div>
        </section>

        {/* İkincil alanlar: istatistikler ve geçmiş */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Bugün" value={`${summary.todayMinutes} dk`} hint={`${summary.todaySessions} seans`} />
              <StatCard label="Bu Hafta" value={`${summary.weekMinutes} dk`} hint={`${summary.weekSessions} seans`} />
              <StatCard label="Seri" value={`${seriAlev} ${summary.streak} gün`} hint="Ardışık gün" />
              <StatCard label="5+ saat gün" value={`${summary.gunluk5SaatGunSayisi}`} hint="Bu ay günde ≥5 saat" />
            </section>

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
                            {session.mod === 'serbest' ? '⏱️' : session.mod === 'gerisayim' ? '⏳' : session.mod === 'ders60mola15' ? '📚' : '📋'}
                          </span>
                          <span className="text-xs text-text-muted truncate">
                            {session.mod === 'serbest' ? 'Kronometre' : session.mod === 'gerisayim' ? 'Zamanlayıcı' : session.mod === 'ders60mola15' ? '60 dk ders / 15 dk mola' : 'Deneme'}
                          </span>
                          <span className="text-xs text-text-muted">
                            {new Date(session.tarihISO).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="text-text-primary font-semibold">{session.sureGercek} dk</span>
                          <span className="rounded-full bg-accent-blue/20 px-2 py-0.5 text-xs font-semibold text-accent-blue">
                            +{session.puan} puan
                          </span>
                          {session.ruhHali && (
                            <span className="text-xs text-text-muted">
                              {session.ruhHali === 'iyi' ? '😊 İyi' : session.ruhHali === 'normal' ? '😐 Normal' : '😤 Yorucu'}
                            </span>
                          )}
                        </div>
                        {session.not && (
                          <p className="text-xs text-text-muted mt-1.5 border-t border-text-primary/5 pt-1.5 italic line-clamp-2" title={session.not}>
                            {session.not}
                          </p>
                        )}
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
          </div>

          <aside className="space-y-4">
            {sinavKalan != null && (
              <div className="rounded-card border border-accent-amber/30 bg-accent-amber/5 p-4 shadow-lg">
                <p className="text-xs uppercase tracking-wider text-text-muted">Sınav</p>
                <p className="font-display text-2xl font-semibold text-accent-amber">{sinavKalan} gün kaldı</p>
                <p className="text-xs text-text-muted mt-1">Hedef tarihe doğru ilerle!</p>
              </div>
            )}
            {/* Günlük hedef çubuğu: Bugün X/300 dk */}
            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-blue-500/5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display text-lg text-text-primary">Bugünkü hedef</h3>
                <span className="text-xs font-semibold text-text-primary">{summary.todayMinutes} / 300 dk</span>
              </div>
              <div className={`h-2 rounded-full bg-surface-700 overflow-hidden transition ${summary.todayMinutes >= 300 ? 'ring-2 ring-emerald-400/50' : ''}`}>
                <div
                  className={`h-full transition ${summary.todayMinutes >= 300 ? 'bg-emerald-500' : 'bg-gradient-to-r from-accent-blue to-accent-cyan'}`}
                  style={{ width: `${Math.min(100, (summary.todayMinutes / 300) * 100)}%` }}
                />
              </div>
              {summary.todayMinutes >= 300 && <p className="text-xs text-emerald-400 mt-1 font-medium">🎉 5 saat tamamlandı!</p>}
            </div>
            {/* Günlük çalışma grafiği: hedef çizgisi, hedefi aşan günler farklı renk */}
            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-cyan-500/5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg text-text-primary">Günlük çalışma</h3>
                <span className="text-xs text-text-muted">Hedef: 5 sa</span>
              </div>
              <div className="relative h-32 flex items-end gap-0.5">
                {(() => {
                  const HEDEF_DK = 300
                  const veri = summary.gunlukSon30Gun
                  const maxDk = Math.max(HEDEF_DK, ...veri.map((d) => d.dakika), 1)
                  const hedefYuzde = (HEDEF_DK / maxDk) * 100
                  return (
                    <>
                      <div
                        className="absolute left-0 right-0 border-t-2 border-dashed border-accent-amber/70 z-10"
                        style={{ bottom: `${hedefYuzde}%` }}
                        title="Hedef: 5 saat"
                      />
                      {veri.map((d) => {
                        const yuzde = (d.dakika / maxDk) * 100
                        const hedefiGecti = d.dakika >= HEDEF_DK
                        return (
                          <div
                            key={d.date}
                            className="flex-1 min-w-0 rounded-t transition-all hover:opacity-90"
                            style={{ height: `${Math.max(2, yuzde)}%` }}
                            title={`${d.date}: ${d.dakika} dk`}
                          >
                            <div
                              className={`h-full w-full rounded-t ${
                                hedefiGecti ? 'bg-accent-cyan/80' : 'bg-text-primary/20'
                              }`}
                            />
                          </div>
                        )
                      })}
                    </>
                  )
                })()}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-text-muted">
                <span>30 gün önce</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-accent-amber/70" /> 5 sa</span>
                <span>Bugün</span>
              </div>
            </div>
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
                <span className="text-xs text-text-muted">5+ saat gün / saat</span>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-text-muted">5+ saatlik gün</span>
                    <span className="text-xs font-semibold text-text-primary">{summary.gunluk5SaatGunSayisi} / 30</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-accent-blue to-accent-cyan transition-all"
                      style={{ width: `${Math.min((summary.gunluk5SaatGunSayisi / 30) * 100, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-text-muted mt-1">Sadece günde toplam ≥5 saat çalışılan günler sayılır.</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-text-muted">Süre Hedefi</span>
                    <span className="text-xs font-semibold text-text-primary">{Math.round(summary.monthMinutes / 60)} / 150 saat</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-accent-amber to-accent-red transition-all"
                      style={{ width: `${Math.min(((summary.monthMinutes / 60) / 150) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Rozetler */}
            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-amber-500/5">
              <h3 className="font-display text-lg text-text-primary mb-3">Rozetlerim</h3>
              <div className="flex flex-wrap gap-2">
                {rozetler.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-lg border px-2 py-1.5 text-xs flex items-center gap-1.5 ${
                      r.kazanildi ? 'border-accent-amber/40 bg-accent-amber/10 text-text-primary' : 'border-text-primary/10 bg-surface-700/30 text-text-muted opacity-60'
                    }`}
                    title={r.aciklama}
                  >
                    <span>{r.emoji}</span>
                    <span className="font-medium">{r.ad}</span>
                  </div>
                ))}
              </div>
            </div>

            {tahminMetni && (
              <div className="rounded-card border border-accent-cyan/20 bg-accent-cyan/5 p-4 shadow-lg">
                <p className="text-sm text-text-primary font-medium">💡 {tahminMetni}</p>
              </div>
            )}

            {/* En verimli saatler (küçük grafik) */}
            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-cyan-500/5">
              <h3 className="font-display text-lg text-text-primary mb-2">En verimli saatler</h3>
              <div className="flex items-end gap-0.5 h-16">
                {saatDagilimi.map((dk, i) => {
                  const maxDk = Math.max(...saatDagilimi, 1)
                  const h = (dk / maxDk) * 100
                  return (
                    <div
                      key={i}
                      className="flex-1 min-w-0 rounded-t bg-accent-cyan/50 hover:bg-accent-cyan/70 transition"
                      style={{ height: `${Math.max(4, h)}%` }}
                      title={`${i}:00–${i + 1}:00 — ${dk} dk`}
                    />
                  )
                })}
              </div>
              <p className="text-[10px] text-text-muted mt-1">0–24 saat (en çok hangi saatte çalışıyorsun)</p>
            </div>

            <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-green-500/5">
              <h3 className="font-display text-lg text-text-primary">Ayarlar (özet)</h3>
              <ul className="mt-3 space-y-2 text-sm text-text-muted">
                <li>Ses: {sesAçık ? 'açık ✓' : 'kapalı ✗'} • Titreşim: {titreşimAçık ? 'açık ✓' : 'kapalı ✗'} • Sessiz: {sessizMod ? 'açık' : 'kapalı'}</li>
                <li>Tema: {tema === 'dark' ? 'koyu' : tema === 'light' ? 'açık' : 'yüksek kontrast'}</li>
                <li><button onClick={() => setShowSettings(true)} className="text-accent-blue hover:text-accent-blue/80">Detaylı ayarları aç →</button></li>
              </ul>
            </div>
          </aside>
        </section>

        <Confetti active={showConfetti} onDone={() => setShowConfetti(false)} />
        {toast && <Toast message={toast.message} visible onDismiss={() => setToast(null)} type={toast.type} />}
        {showLevelUp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowLevelUp(null)}>
            <div className="rounded-card border border-accent-amber/50 bg-surface-800 p-6 shadow-2xl max-w-sm text-center animate-[fadeIn_0.3s]" onClick={(e) => e.stopPropagation()}>
              <p className="text-5xl mb-2">{showLevelUp.emoji}</p>
              <h2 className="font-display text-2xl font-bold text-accent-amber mb-2">Tebrikler!</h2>
              <p className="text-text-primary font-semibold">Yeni ünvan: {showLevelUp.unvan}</p>
              <button
                onClick={() => setShowLevelUp(null)}
                className="mt-4 rounded-full bg-accent-amber px-6 py-2 font-semibold text-surface-900"
              >
                Harika!
              </button>
            </div>
          </div>
        )}
        {showSettings && (
          <Suspense fallback={null}>
            <SettingsModal onClose={() => setShowSettings(false)} />
          </Suspense>
        )}
        {showMotivasyon && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowMotivasyon(false)}>
            <div
              className="rounded-card border border-accent-amber/30 bg-surface-800 p-6 shadow-xl max-w-md w-full max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl text-text-primary">Motivasyon – ilerideki ünvanlar</h2>
                <button
                  type="button"
                  onClick={() => setShowMotivasyon(false)}
                  className="rounded-full p-2 text-text-muted hover:bg-surface-700 hover:text-text-primary"
                  aria-label="Kapat"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="mb-4 flex items-center gap-3 rounded-lg bg-accent-amber/10 border border-accent-amber/20 p-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-700 text-2xl">{summary.unvanBilgisi.profilEmoji}</div>
                <div>
                  <p className="font-semibold text-accent-amber">{summary.unvanBilgisi.unvan}</p>
                  <p className="text-sm text-text-muted">{summary.toplamKariyerPuan} puan</p>
                  {summary.unvanBilgisi.sonrakiUnvan != null && summary.unvanBilgisi.ilerlemeYuzde != null && (
                    <p className="text-xs text-text-muted mt-1">→ {summary.unvanBilgisi.sonrakiUnvan}’a %{summary.unvanBilgisi.ilerlemeYuzde}</p>
                  )}
                </div>
              </div>
              {summary.unvanBilgisi.sonrakiUnvan != null && summary.unvanBilgisi.ilerlemeYuzde != null && (
                <div className="mb-4">
                  <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent-amber to-accent-cyan transition-all"
                      style={{ width: `${summary.unvanBilgisi.ilerlemeYuzde}%` }}
                    />
                  </div>
                </div>
              )}
              <h3 className="text-sm font-semibold text-text-primary mb-2">İleride açılacaklar</h3>
              <ul className="space-y-2">
                {summary.unvanBilgisi.ileridekiler.length === 0 ? (
                  <li className="text-sm text-text-muted">Tüm ünvanlar açık. 🎉</li>
                ) : (
                  summary.unvanBilgisi.ileridekiler.map((t) => (
                    <li key={t.puan} className="flex items-start gap-3 rounded-lg border border-text-primary/10 bg-surface-900/50 p-3">
                      <span className="text-xl shrink-0" aria-hidden>{t.profilEmoji}</span>
                      <div>
                        <p className="font-semibold text-text-primary">{t.unvan} — {t.puan} puan</p>
                        <p className="text-xs text-text-muted">{t.aciklama}</p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const SectionList = memo(function SectionList({
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
            type="button"
            className={`w-full rounded-lg border px-3 py-2.5 min-h-[44px] text-left text-sm transition touch-manipulation ${
              idx === activeIdx 
                ? 'border-accent-amber/60 bg-accent-amber/10 text-text-primary font-semibold' 
                : 'border-text-primary/5 bg-text-primary/0 text-text-muted hover:border-accent-blue/40 hover:bg-text-primary/5 active:bg-text-primary/10'
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
})

export default App
