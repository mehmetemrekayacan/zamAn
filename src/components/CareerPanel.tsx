import { memo, useState } from 'react'
import { TitlesModal } from './TitlesModal'

export interface CareerPanelProps {
  toplamPuan: number
  unvanEmoji: string
  unvanText: string
  sonrakiUnvan?: string
  sonrakiPuan?: number
  ilerlemeYuzde?: number
  tahmin?: string
  monthMinutes: number
  monthSessions: number
  avgScoreMonth: number
  rozetler: { id: string; emoji: string; ad: string; aciklama: string; kazanildi: boolean }[]
}

export const CareerPanel = memo(function CareerPanel({
  toplamPuan,
  unvanEmoji,
  unvanText,
  sonrakiUnvan,
  sonrakiPuan,
  ilerlemeYuzde,
  tahmin,
  monthMinutes,
  monthSessions,
  avgScoreMonth,
  rozetler,
}: CareerPanelProps) {
  const [isTitlesModalOpen, setIsTitlesModalOpen] = useState(false)

  return (
    <>
      <div className="space-y-5">
        {/* Kariyer kartı */}
        <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-label">Profil</p>
            <h3 className="section-title text-lg">Kariyer</h3>
          </div>
          <span className="rounded-full bg-surface-600/50 px-2.5 py-0.5 text-xs text-text-muted">{toplamPuan} puan</span>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <span className="text-4xl">{unvanEmoji}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text-primary text-lg">{unvanText}</p>
            {sonrakiUnvan && (
              <p className="text-xs text-text-muted">
                Sonraki: {sonrakiUnvan} ({sonrakiPuan} puan)
              </p>
            )}
          </div>
        </div>

          <button
            type="button"
            onClick={() => setIsTitlesModalOpen(true)}
            className="mb-4 inline-flex w-full items-center justify-center rounded-card-sm border border-secondary/45 bg-secondary px-3 py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-secondary/90"
          >
            Tüm Ünvanları Gör
          </button>

          {ilerlemeYuzde != null && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-text-muted">İlerleme</span>
                <span className="text-xs font-semibold text-success">%{ilerlemeYuzde}</span>
              </div>
              <div className="h-2.5 rounded-full bg-surface-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-success transition-all duration-500"
                  style={{ width: `${ilerlemeYuzde}%` }}
                />
              </div>
            </div>
          )}

          {tahmin && (
            <p className="mt-3 text-xs text-text-muted">💡 {tahmin}</p>
          )}
        </div>

        {/* Aylık istatistikler */}
        <div className="card p-5">
        <div className="mb-4">
          <p className="section-label">Bu Ay</p>
          <h3 className="section-title text-lg">İstatistikler</h3>
        </div>
        <dl className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Toplam Süre</span>
            <span className="font-semibold text-text-primary">{monthMinutes} dk</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Seans Sayısı</span>
            <span className="font-semibold text-info">{monthSessions}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Ort. Puan</span>
            <span className="font-semibold text-success">{avgScoreMonth}</span>
          </div>
        </dl>
        </div>

        {/* Rozetler */}
        <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="section-label">Başarılar</p>
            <h3 className="section-title text-lg">Rozetler</h3>
          </div>
          <span className="text-xs text-text-muted">
            {rozetler.filter((r) => r.kazanildi).length}/{rozetler.length}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {rozetler.map((rozet) => (
            <div
              key={rozet.id}
              className={`flex flex-col items-center rounded-card-sm p-2.5 text-center transition-all duration-200 ${
                rozet.kazanildi
                  ? 'border border-success/35 bg-success/12 hover:bg-success/20 hover:scale-105'
                  : 'border border-[var(--card-border)] bg-surface-700/20 opacity-40'
              }`}
              title={rozet.aciklama}
            >
              <span className="text-xl">{rozet.emoji}</span>
              <span className="mt-1 text-[10px] leading-tight text-text-muted">
                {rozet.ad}
              </span>
            </div>
          ))}
        </div>
        </div>
      </div>
      <TitlesModal
        isOpen={isTitlesModalOpen}
        onClose={() => setIsTitlesModalOpen(false)}
        currentScore={toplamPuan}
      />
    </>
  )
})
