import { useEffect, useRef, useState } from 'react'
import { clearAllSessions } from '../lib/db'
import {
  getCurrentUser,
  getLastSyncTime,
  isCloudSyncEnabled,
  pullCloud,
  pushCloud,
  signIn,
  signOut,
  signUp,
  syncCloud,
} from '../lib/cloudSync'
import { getQueueLength } from '../lib/offlineSync'
import { exportData, exportFileName, importFromFile } from '../lib/sync'
import { useSettingsStore } from '../store/settings'
import type { VurguRengi } from '../store/settings'
import { canInstallPwa, isPwaInstalled, promptInstallPwa } from '../lib/pwaInstall'
import { isElectron, toggleAlwaysOnTop, toggleMiniPlayer } from '../lib/electronBridge'

export interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const tema = useSettingsStore((s) => s.tema)
  const sesAçık = useSettingsStore((s) => s.sesAçık)
  const titreşimAçık = useSettingsStore((s) => s.titreşimAçık)
  const sessizMod = useSettingsStore((s) => s.sessizMod)
  const bildirimİzni = useSettingsStore((s) => s.bildirimİzni)
  const kısayollar = useSettingsStore((s) => s.kısayollar)
  const kullaniciAdi = useSettingsStore((s) => s.kullaniciAdi ?? '')
  const sinavTarihi = useSettingsStore((s) => s.sinavTarihi ?? null)
  const vurguRengi = useSettingsStore((s) => s.vurguRengi ?? 'mavi')
  const setSetting = useSettingsStore((s) => s.setSetting)
  const [temizleniyor, setTemizleniyor] = useState(false)
  const [disaAktariyor, setDisaAktariyor] = useState(false)
  const [iceAktariyor, setIceAktariyor] = useState(false)
  const [iceAktarHata, setIceAktarHata] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [cloudUser, setCloudUser] = useState<Awaited<ReturnType<typeof getCurrentUser>>>(null)
  const [cloudEmail, setCloudEmail] = useState('')
  const [cloudPassword, setCloudPassword] = useState('')
  const [cloudIsim, setCloudIsim] = useState('')
  const [cloudLoading, setCloudLoading] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [cloudPushPullMsg, setCloudPushPullMsg] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const cloudEnabled = isCloudSyncEnabled()

  useEffect(() => {
    if (cloudEnabled) {
      void getCurrentUser().then(setCloudUser)
      void getQueueLength().then(setPendingCount)
      setLastSync(getLastSyncTime())
    }
  }, [cloudEnabled])

  const handleKayit = async () => {
    setCloudLoading(true)
    setCloudError(null)
    const r = await signUp(cloudEmail, cloudPassword, cloudIsim)
    setCloudLoading(false)
    if (r.ok) {
      setCloudUser(r.user)
      setCloudPassword('')
    } else setCloudError(r.error)
  }

  const handleGiris = async () => {
    setCloudLoading(true)
    setCloudError(null)
    const r = await signIn(cloudEmail, cloudPassword)
    setCloudLoading(false)
    if (r.ok) {
      setCloudUser(r.user)
      setCloudPassword('')
    } else setCloudError(r.error)
  }

  const handleCikis = async () => {
    await signOut()
    setCloudUser(null)
    setCloudEmail('')
    setCloudPassword('')
    setCloudIsim('')
    setCloudError(null)
  }

  const handleBulutaKaydet = async () => {
    setCloudLoading(true)
    setCloudError(null)
    setCloudPushPullMsg(null)
    const r = await pushCloud()
    setCloudLoading(false)
    if (r.ok) {
      setCloudPushPullMsg(`Buluta kaydedildi (${r.pushed} seans).`)
      setPendingCount(0)
      setLastSync(new Date().toISOString())
    } else setCloudError(r.error)
  }

  const handleBuluttanCek = async () => {
    setCloudLoading(true)
    setCloudError(null)
    setCloudPushPullMsg(null)
    const r = await pullCloud()
    setCloudLoading(false)
    if (r.ok) {
      setCloudPushPullMsg(`Buluttan çekildi (${r.pulled} yeni, ${r.merged} güncellenen).`)
      setLastSync(new Date().toISOString())
      window.location.reload()
    } else setCloudError(r.error)
  }

  const handleTumVerileriTemizle = async () => {
    if (!window.confirm('Tüm seanslar, zamanlayıcı durumu ve deneme ayarları silinecek. Tema ve ses ayarları korunur. Emin misin?')) return
    setTemizleniyor(true)
    try {
      await clearAllSessions()
      localStorage.removeItem('deneme-config')
      localStorage.removeItem('timer-storage')
      localStorage.removeItem('zaman-ders60-pause-state')
      window.location.reload()
    } finally {
      setTemizleniyor(false)
    }
  }

  const handleDisaAktar = async () => {
    setDisaAktariyor(true)
    setIceAktarHata(null)
    try {
      const blob = await exportData()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = exportFileName()
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDisaAktariyor(false)
    }
  }

  const handleIceAktar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setIceAktariyor(true)
    setIceAktarHata(null)
    const result = await importFromFile(file)
    setIceAktariyor(false)
    if (result.ok) {
      window.location.reload()
    } else {
      setIceAktarHata(result.error)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 border border-text-primary/10 rounded-card max-w-sm w-full max-h-[85vh] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between bg-surface-800 px-4 sm:px-6 py-4 sm:py-5 border-b border-text-primary/10">
          <h2 className="font-display text-lg sm:text-xl text-text-primary">Ayarlar</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition flex-shrink-0"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 space-y-4">
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-text-primary">Bildirimler</h3>

            <div className="flex items-center justify-between p-2 sm:p-3 rounded-lg border border-text-primary/10 bg-surface-700/50 hover:border-accent-blue/30">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-accent-blue flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 9a2 2 0 114 0 2 2 0 11-4 0z" />
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <label className="text-sm sm:text-base text-text-primary cursor-pointer whitespace-nowrap">Ses</label>
              </div>
              <button
                onClick={() => setSetting('sesAçık', !sesAçık)}
                className={`w-10 h-5 sm:w-11 sm:h-6 rounded-full transition flex-shrink-0 ml-2 ${
                  sesAçık ? 'bg-accent-blue' : 'bg-surface-600'
                }`}
              >
                <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white transition transform ${
                  sesAçık ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-2 sm:p-3 rounded-lg border border-text-primary/10 bg-surface-700/50 hover:border-accent-blue/30">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-accent-amber flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
                </svg>
                <label className="text-sm sm:text-base text-text-primary cursor-pointer whitespace-nowrap">Titreşim</label>
              </div>
              <button
                onClick={() => setSetting('titreşimAçık', !titreşimAçık)}
                className={`w-10 h-5 sm:w-11 sm:h-6 rounded-full transition flex-shrink-0 ml-2 ${
                  titreşimAçık ? 'bg-accent-amber' : 'bg-surface-600'
                }`}
              >
                <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white transition transform ${
                  titreşimAçık ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-2 sm:p-3 rounded-lg border border-text-primary/10 bg-surface-700/50 hover:border-accent-blue/30">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-accent-green flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.076l-3.5-4a1 1 0 010-1.152l3.5-4a1 1 0 011.617-.076zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.113-.84-4.13-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                </svg>
                <label className="text-sm sm:text-base text-text-primary cursor-pointer whitespace-nowrap" title="Seans sırasında ses kapalı">Sessiz mod</label>
              </div>
              <button
                onClick={() => setSetting('sessizMod', !sessizMod)}
                className={`w-10 h-5 sm:w-11 sm:h-6 rounded-full transition flex-shrink-0 ml-2 ${
                  sessizMod ? 'bg-green-500' : 'bg-surface-600'
                }`}
              >
                <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white transition transform ${
                  sessizMod ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-2 sm:p-3 rounded-lg border border-text-primary/10 bg-surface-700/50 hover:border-accent-blue/30">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-accent-cyan flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586L4.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L7 11.586V8a5 5 0 0110 0v1h2V8a7 7 0 00-7-7z" />
                </svg>
                <label className="text-sm sm:text-base text-text-primary cursor-pointer whitespace-nowrap">Tarayıcı Bildirimi</label>
              </div>
              <button
                onClick={async () => {
                  if (bildirimİzni !== 'granted') {
                    if (!('Notification' in window)) {
                      alert('Tarayıcınız bildirimleri desteklemiyor')
                      return
                    }
                    const permission = await Notification.requestPermission()
                    setSetting('bildirimİzni', permission === 'granted' ? 'granted' : 'denied')
                  } else {
                    setSetting('bildirimİzni', 'denied')
                  }
                }}
                className={`w-10 h-5 sm:w-11 sm:h-6 rounded-full transition flex-shrink-0 ml-2 ${
                  bildirimİzni === 'granted' ? 'bg-accent-cyan' : 'bg-surface-600'
                }`}
              >
                <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white transition transform ${
                  bildirimİzni === 'granted' ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-text-primary/10">
            <h3 className="text-base font-semibold text-text-primary">Kişiselleştirme</h3>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-text-muted mb-1">İsim (selamda kullanılır)</label>
                <input
                  type="text"
                  value={kullaniciAdi}
                  onChange={(e) => setSetting('kullaniciAdi', e.target.value)}
                  placeholder="ör. Luna"
                  className="w-full rounded-lg border border-text-primary/10 bg-surface-700 px-3 py-2 text-text-primary placeholder-text-muted text-sm focus:border-accent-blue/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Sınav tarihi (X gün kaldı)</label>
                <input
                  type="date"
                  value={sinavTarihi ?? ''}
                  onChange={(e) => setSetting('sinavTarihi', e.target.value || null)}
                  className="w-full rounded-lg border border-text-primary/10 bg-surface-700 px-3 py-2 text-text-primary text-sm focus:border-accent-blue/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-2">Vurgu rengi</label>
                <div className="flex gap-2 flex-wrap">
                  {(['mavi', 'mor', 'yeşil', 'pembe'] as VurguRengi[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSetting('vurguRengi', r)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
                        vurguRengi === r
                          ? 'border-accent-blue/60 bg-accent-blue/20 text-text-primary'
                          : 'border-text-primary/10 bg-surface-700/50 text-text-muted hover:border-accent-blue/30'
                      }`}
                    >
                      {r === 'yeşil' ? 'Yeşil' : r === 'mor' ? 'Mor' : r === 'pembe' ? 'Pembe' : 'Mavi'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-text-primary/10">
            <h3 className="text-base font-semibold text-text-primary">Görünüm</h3>
            <div className="space-y-2">
              {(['dark', 'light', 'high-contrast'] as const).map((themeOption) => (
                <button
                  key={themeOption}
                  onClick={() => setSetting('tema', themeOption)}
                  className={`w-full p-2 sm:p-3 rounded-lg border transition text-left text-sm sm:text-base ${
                    tema === themeOption
                      ? 'border-accent-blue/60 bg-accent-blue/10 text-text-primary font-semibold'
                      : 'border-text-primary/10 bg-surface-700/50 text-text-muted hover:border-accent-blue/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize truncate">
                      {themeOption === 'dark' ? '🌙 Koyu Tema' : themeOption === 'light' ? '☀️ Açık Tema' : '⚡ Yüksek Kontrast'}
                    </span>
                    {tema === themeOption && (
                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-accent-blue flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-text-primary/10">
            <h3 className="text-base font-semibold text-text-primary">Kısayollar</h3>
            <div className="space-y-2">
              {[
                { key: 'startStop' as const, label: 'Başlat / Duraklat', currentValue: kısayollar.startStop },
                { key: 'reset' as const, label: 'Sıfırla', currentValue: kısayollar.reset },
                { key: 'modGeçiş' as const, label: 'Mod Değiştir', currentValue: kısayollar.modGeçiş },
              ].map(({ key, label, currentValue }) => (
                <div key={key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 sm:p-3 rounded-lg border border-text-primary/10 bg-surface-700/50">
                  <label className="text-xs sm:text-sm text-text-muted whitespace-nowrap">{label}</label>
                  <div className="flex gap-1 sm:gap-2 items-center">
                    <kbd className="px-2 py-1 sm:px-3 sm:py-1 rounded bg-surface-600 border border-text-primary/10 text-text-primary font-mono text-xs sm:text-sm whitespace-nowrap">
                      {currentValue}
                    </kbd>
                    <button
                      onClick={() => {
                        const newValue = prompt(`"${label}" için yeni tuş kombinasyonu girin (ör: Space, KeyA, KeyR)`)
                        if (newValue) {
                          setSetting('kısayollar', {
                            ...kısayollar,
                            [key]: newValue,
                          })
                        }
                      }}
                      className="px-2 py-1 text-xs bg-accent-blue/20 hover:bg-accent-blue/30 border border-accent-blue/50 rounded text-accent-blue transition whitespace-nowrap"
                    >
                      Değiştir
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-text-muted mt-2">
                💡 Tuş kodlarını görmek için: Browser DevTools → Console üzerinde <code className="bg-surface-700 px-1 py-0.5 rounded">event.code</code> yazın
              </p>
            </div>
          </div>

          {cloudEnabled && (
            <div className="space-y-2 pt-3 border-t border-text-primary/10">
              <h3 className="text-base font-semibold text-text-primary">Hesap (online senkron)</h3>
              {cloudUser ? (
                <>
                  <p className="text-sm text-text-primary">
                    Merhaba, {cloudUser.displayName || cloudUser.email}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleBulutaKaydet}
                      disabled={cloudLoading}
                      className="flex-1 rounded-lg border border-accent-blue/50 bg-accent-blue/10 hover:bg-accent-blue/20 px-3 py-2 text-sm font-medium text-accent-blue transition disabled:opacity-50"
                    >
                      {cloudLoading ? '…' : '⬆ Gönder'}
                    </button>
                    <button
                      type="button"
                      onClick={handleBuluttanCek}
                      disabled={cloudLoading}
                      className="flex-1 rounded-lg border border-accent-green/50 bg-accent-green/10 hover:bg-accent-green/20 px-3 py-2 text-sm font-medium text-accent-green transition disabled:opacity-50"
                    >
                      {cloudLoading ? '…' : '⬇ Çek'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setCloudLoading(true)
                      setCloudError(null)
                      setCloudPushPullMsg(null)
                      const r = await syncCloud()
                      setCloudLoading(false)
                      if (r.ok) {
                        setCloudPushPullMsg(`Sync tamamlandı: ${r.pushed} gönderildi, ${r.pulled} yeni, ${r.merged} güncellendi.`)
                        setPendingCount(0)
                        setLastSync(new Date().toISOString())
                      } else setCloudError(r.error)
                    }}
                    disabled={cloudLoading}
                    className="w-full rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 hover:bg-accent-cyan/20 px-3 py-2 text-sm font-medium text-accent-cyan transition disabled:opacity-50"
                  >
                    {cloudLoading ? '…' : '🔄 Çift yönlü sync'}
                  </button>
                  {pendingCount > 0 && (
                    <p className="text-xs text-accent-amber">⏳ {pendingCount} bekleyen işlem kuyruktadır.</p>
                  )}
                  {lastSync && (
                    <p className="text-xs text-text-muted">Son sync: {new Date(lastSync).toLocaleString('tr-TR')}</p>
                  )}
                  {cloudPushPullMsg && <p className="text-xs text-accent-green">{cloudPushPullMsg}</p>}
                  <button
                    type="button"
                    onClick={handleCikis}
                    className="w-full rounded-lg border border-text-primary/20 bg-surface-700/50 px-3 py-2 text-sm font-medium text-text-muted hover:text-text-primary transition"
                  >
                    Çıkış yap
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-text-muted">İsim / e-posta ve şifreyle kayıt ol veya giriş yap. Veriler aynı hesaba her cihazda sync olur.</p>
                  <input
                    type="text"
                    placeholder="İsim (kayıt için)"
                    value={cloudIsim}
                    onChange={(e) => setCloudIsim(e.target.value)}
                    className="w-full rounded-lg border border-text-primary/10 bg-surface-700 px-3 py-2 text-text-primary placeholder-text-muted text-sm focus:border-accent-blue/50 focus:outline-none"
                  />
                  <input
                    type="email"
                    placeholder="E-posta"
                    value={cloudEmail}
                    onChange={(e) => setCloudEmail(e.target.value)}
                    className="w-full rounded-lg border border-text-primary/10 bg-surface-700 px-3 py-2 text-text-primary placeholder-text-muted text-sm focus:border-accent-blue/50 focus:outline-none"
                  />
                  <input
                    type="password"
                    placeholder="Şifre"
                    value={cloudPassword}
                    onChange={(e) => setCloudPassword(e.target.value)}
                    className="w-full rounded-lg border border-text-primary/10 bg-surface-700 px-3 py-2 text-text-primary placeholder-text-muted text-sm focus:border-accent-blue/50 focus:outline-none"
                  />
                  {cloudError && <p className="text-xs text-red-400">{cloudError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleKayit}
                      disabled={cloudLoading}
                      className="flex-1 rounded-lg border border-accent-blue/50 bg-accent-blue/10 hover:bg-accent-blue/20 px-3 py-2 text-sm font-medium text-accent-blue transition disabled:opacity-50"
                    >
                      {cloudLoading ? '…' : 'Kayıt ol'}
                    </button>
                    <button
                      type="button"
                      onClick={handleGiris}
                      disabled={cloudLoading}
                      className="flex-1 rounded-lg border border-accent-green/50 bg-accent-green/10 hover:bg-accent-green/20 px-3 py-2 text-sm font-medium text-accent-green transition disabled:opacity-50"
                    >
                      {cloudLoading ? '…' : 'Giriş yap'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-2 pt-3 border-t border-text-primary/10">
            <h3 className="text-base font-semibold text-text-primary">Veri</h3>
            <p className="text-xs text-text-muted">
              Windows ve telefon arasında senkron için: buradan dışa aktar, diğer cihazda içe aktar.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDisaAktar}
                disabled={disaAktariyor}
                className="flex-1 rounded-lg border border-accent-blue/50 bg-accent-blue/10 hover:bg-accent-blue/20 px-3 py-2 text-sm font-medium text-accent-blue transition disabled:opacity-50"
              >
                {disaAktariyor ? '…' : 'Dışa aktar'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={iceAktariyor}
                className="flex-1 rounded-lg border border-accent-green/50 bg-accent-green/10 hover:bg-accent-green/20 px-3 py-2 text-sm font-medium text-accent-green transition disabled:opacity-50"
              >
                {iceAktariyor ? '…' : 'İçe aktar'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleIceAktar}
              />
            </div>
            {iceAktarHata && (
              <p className="text-xs text-red-400">{iceAktarHata}</p>
            )}
            <p className="text-xs text-text-muted mt-2">
              Tüm seansları, zamanlayıcı durumunu (tur, mola vb.) ve deneme bölüm ayarlarını siler. Deneme modu varsayılana (<strong>AGS 110 dk</strong>, <strong>ÖABT 90 dk</strong>) döner. Tema ve ses ayarları korunur.
            </p>
            <button
              type="button"
              onClick={handleTumVerileriTemizle}
              disabled={temizleniyor}
              className="w-full rounded-lg border border-red-500/50 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 text-sm font-medium text-red-400 transition disabled:opacity-50"
            >
              {temizleniyor ? 'Temizleniyor…' : 'Tüm verileri temizle'}
            </button>
          </div>

          {/* PWA Yükleme */}
          {!isPwaInstalled() && canInstallPwa() && (
            <div className="space-y-2 pt-3 border-t border-text-primary/10">
              <h3 className="text-base font-semibold text-text-primary">Uygulama</h3>
              <button
                type="button"
                onClick={async () => {
                  const accepted = await promptInstallPwa()
                  if (accepted) window.location.reload()
                }}
                className="w-full rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 hover:bg-accent-cyan/20 px-3 py-2 text-sm font-medium text-accent-cyan transition"
              >
                📲 Uygulamayı Ana Ekrana Ekle
              </button>
              <p className="text-xs text-text-muted">
                zamAn&apos;ı bir uygulama gibi kullanmak için ana ekrana ekleyin. Çevrimdışı çalışır.
              </p>
            </div>
          )}

          {/* Masaüstü (Electron) Kontrolleri */}
          {isElectron() && (
            <div className="space-y-2 pt-3 border-t border-text-primary/10">
              <h3 className="text-base font-semibold text-text-primary">🖥️ Masaüstü</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleAlwaysOnTop(true)}
                  className="flex-1 rounded-lg border border-accent-amber/50 bg-accent-amber/10 hover:bg-accent-amber/20 px-3 py-2 text-sm font-medium text-accent-amber transition"
                >
                  📌 Her Zaman Üstte
                </button>
                <button
                  type="button"
                  onClick={() => toggleAlwaysOnTop(false)}
                  className="flex-1 rounded-lg border border-text-primary/20 bg-surface-700/50 hover:bg-surface-600/50 px-3 py-2 text-sm font-medium text-text-muted transition"
                >
                  Normal
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleMiniPlayer(true)}
                  className="flex-1 rounded-lg border border-accent-cyan/50 bg-accent-cyan/10 hover:bg-accent-cyan/20 px-3 py-2 text-sm font-medium text-accent-cyan transition"
                >
                  🔲 Mini Player
                </button>
                <button
                  type="button"
                  onClick={() => toggleMiniPlayer(false)}
                  className="flex-1 rounded-lg border border-text-primary/20 bg-surface-700/50 hover:bg-surface-600/50 px-3 py-2 text-sm font-medium text-text-muted transition"
                >
                  Normal Boyut
                </button>
              </div>
              <p className="text-xs text-text-muted">
                Kısayollar: <kbd className="px-1 py-0.5 rounded bg-surface-600 text-text-primary text-xs">Ctrl+Shift+Space</kbd> Başlat/Duraklat · <kbd className="px-1 py-0.5 rounded bg-surface-600 text-text-primary text-xs">Ctrl+Shift+R</kbd> Sıfırla · <kbd className="px-1 py-0.5 rounded bg-surface-600 text-text-primary text-xs">Ctrl+Shift+M</kbd> Mini Player
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-text-primary/10 px-4 sm:px-6 py-4 bg-surface-800">
          <button
            onClick={onClose}
            className="w-full rounded-full bg-accent-blue/20 hover:bg-accent-blue/30 border border-accent-blue/50 px-4 py-2 text-accent-blue font-semibold transition text-sm"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
