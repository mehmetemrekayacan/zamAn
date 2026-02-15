import { memo } from 'react'
import { getSelam, getSinavKalanGun } from '../lib/selam'

export interface DashboardHeaderProps {
  kullaniciAdi: string
  sinavTarihi: string | null
  unvanEmoji: string
  unvanText: string
  onSettingsClick: () => void
}

export const DashboardHeader = memo(function DashboardHeader({
  kullaniciAdi,
  sinavTarihi,
  unvanEmoji,
  unvanText,
  onSettingsClick,
}: DashboardHeaderProps) {
  const kalan = sinavTarihi ? getSinavKalanGun(sinavTarihi) : null

  return (
    <header className="flex items-center justify-between py-2">
      {/* Sol: Selamlama & Ünvan */}
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.2em] text-text-muted">
          {getSelam(kullaniciAdi)}
        </p>
        <h1 className="font-display text-2xl font-semibold text-text-primary sm:text-3xl">
          {unvanEmoji} {unvanText}
        </h1>
        {kalan != null && kalan > 0 && (
          <p className="mt-1 text-xs text-accent-amber">
            📅 Sınava <span className="font-semibold">{kalan}</span> gün kaldı
          </p>
        )}
        {kalan === 0 && (
          <p className="mt-1 text-xs font-semibold text-accent-red">
            🔥 Sınav bugün! Başarılar!
          </p>
        )}
      </div>

      {/* Sağ: Ayarlar butonu */}
      <button
        onClick={onSettingsClick}
        className="group relative rounded-xl bg-surface-800/60 p-2.5 border border-text-primary/10 
                   hover:border-accent-blue/40 hover:bg-accent-blue/10 transition-all duration-200
                   text-text-muted hover:text-accent-blue"
        title="Ayarlar"
      >
        <svg className="w-5 h-5 transition-transform group-hover:rotate-90 duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </header>
  )
})
