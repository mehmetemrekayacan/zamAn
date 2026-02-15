import { memo } from 'react'

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
  return (
    <div className="space-y-5">
      {/* Kariyer kartı */}
      <div className="rounded-2xl border border-text-primary/5 bg-surface-800/60 p-5 shadow-lg shadow-purple-500/5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-text-primary">Kariyer</h3>
          <span className="text-xs text-text-muted">{toplamPuan} puan</span>
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

        {ilerlemeYuzde != null && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-text-muted">İlerleme</span>
              <span className="text-xs font-semibold text-accent-blue">%{ilerlemeYuzde}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-blue to-accent-cyan transition-all duration-500"
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
      <div className="rounded-2xl border border-text-primary/5 bg-surface-800/60 p-5 shadow-lg shadow-amber-500/5">
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted">Bu Ay</p>
          <h3 className="font-display text-lg font-semibold text-text-primary">İstatistikler</h3>
        </div>
        <dl className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Toplam Süre</span>
            <span className="font-semibold text-text-primary">{monthMinutes} dk</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Seans Sayısı</span>
            <span className="font-semibold text-accent-amber">{monthSessions}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Ort. Puan</span>
            <span className="font-semibold text-accent-cyan">{avgScoreMonth}</span>
          </div>
        </dl>
      </div>

      {/* Rozetler */}
      <div className="rounded-2xl border border-text-primary/5 bg-surface-800/60 p-5 shadow-lg shadow-amber-500/5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-text-primary">Rozetler</h3>
          <span className="text-xs text-text-muted">
            {rozetler.filter((r) => r.kazanildi).length}/{rozetler.length}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {rozetler.map((rozet) => (
            <div
              key={rozet.id}
              className={`flex flex-col items-center rounded-xl p-2.5 text-center transition-all duration-200 ${
                rozet.kazanildi
                  ? 'border border-accent-amber/30 bg-accent-amber/10 hover:bg-accent-amber/15'
                  : 'border border-text-primary/5 bg-surface-700/20 opacity-40'
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
  )
})
