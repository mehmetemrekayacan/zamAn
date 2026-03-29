import { useEffect, useState } from 'react'
import type { DenemeAnaliz as DenemeAnalizType, Mode, RuhHali } from '../types'
import type { ScoreBreakdown } from '../lib/scoring'
import { formatSeconds } from '../lib/time'

const modes = [
  { id: 'serbest' as const, title: 'Kronometre' },
  { id: 'gerisayim' as const, title: 'Zamanlayıcı' },
  { id: 'ders60mola15' as const, title: '60 dk ders / 15 dk mola' },
  { id: 'deneme' as const, title: 'Deneme Sınavı' },
]

const ScoreRow = ({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: 'blue' | 'red' | 'amber'
}) => {
  const colorMap = {
    blue: 'text-primary',
    red: 'text-primary',
    amber: 'text-primary',
  }
  const signedValue = value >= 0 ? `+${value}` : `${value}`
  return (
    <div className="flex items-center justify-between rounded-lg border border-text-primary/5 bg-surface-900/50 px-4 py-3">
      <span className="text-sm text-text-muted">{label}</span>
      <span className={`font-semibold ${colorMap[accent]}`}>{signedValue}</span>
    </div>
  )
}

/** Re-export for consumers */
export type DenemeAnaliz = DenemeAnalizType

export interface FinishScreenProps {
  score: ScoreBreakdown
  mode: Mode
  elapsedMs: number
  pauses: number
  sessionNote: string
  onSessionNoteChange: (value: string) => void
  sessionRuhHali?: RuhHali | null
  onRuhHaliChange?: (value: RuhHali | null) => void
  /** Sadece deneme modunda: doğru / yanlış / boş sayıları */
  denemeAnaliz?: DenemeAnalizType | null
  onDenemeAnalizChange?: (value: DenemeAnalizType | null) => void
  onSave: () => void
  onCancel: () => void

  /* ── Wall-Clock vs Net-Time rapor alanları ── */
  /** Toplam birikmiş duraklatma süresi (ms) */
  totalPauseDurationMs?: number
  /** Arka plandaki mola başlangıç zamanı (Date.now() epoch ms) — live countdown için */
  backgroundBreakStartTs?: number | null
  /** Arka plandaki mola planlanan süresi (ms) */
  backgroundBreakPlannedMs?: number
}

const isValidEpochMs = (value: number | null | undefined): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
)

const RUH_HALI_OPTS: { value: RuhHali; label: string; emoji: string }[] = [
  { value: 'iyi', label: 'İyi', emoji: '😊' },
  { value: 'normal', label: 'Normal', emoji: '😐' },
  { value: 'yorucu', label: 'Yorucu', emoji: '😤' },
]
const clampNum = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export function FinishScreen({
  score,
  mode,
  elapsedMs,
  pauses,
  sessionNote,
  onSessionNoteChange,
  sessionRuhHali,
  onRuhHaliChange,
  denemeAnaliz,
  onDenemeAnalizChange,
  onSave,
  onCancel,
  totalPauseDurationMs = 0,
  backgroundBreakStartTs,
  backgroundBreakPlannedMs,
}: FinishScreenProps) {
  const isDeneme = mode === 'deneme'
  const analiz = denemeAnaliz ?? { dogru: 0, yanlis: 0, bos: 0 }
  const setAnaliz = (next: Partial<DenemeAnalizType>) => {
    if (onDenemeAnalizChange) {
      onDenemeAnalizChange({ ...analiz, ...next })
    }
  }

  /* ── Arka plandaki mola countdown — her saniye güncellenir ── */
  const hasBackgroundBreak = isValidEpochMs(backgroundBreakStartTs)
    && typeof backgroundBreakPlannedMs === 'number'
    && Number.isFinite(backgroundBreakPlannedMs)
    && backgroundBreakPlannedMs > 0
  const [breakRemainingMs, setBreakRemainingMs] = useState(0)

  useEffect(() => {
    if (!hasBackgroundBreak || !isValidEpochMs(backgroundBreakStartTs) || backgroundBreakPlannedMs == null) {
      setBreakRemainingMs(0)
      return
    }

    const update = () => {
      const elapsed = Math.max(0, Date.now() - backgroundBreakStartTs)
      setBreakRemainingMs(Math.max(0, backgroundBreakPlannedMs - elapsed))
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [hasBackgroundBreak, backgroundBreakStartTs, backgroundBreakPlannedMs])

  /* Wall-Clock hesaplaması */
  const totalDurationMs = elapsedMs + totalPauseDurationMs
  const hasPauses = totalPauseDurationMs > 0

  return (
    <div className="min-h-screen bg-surface-900 text-text-primary">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <header>
          <p className="text-sm uppercase tracking-widest text-text-muted">Seans Tamamlandı</p>
          <h1 className="font-display text-3xl font-semibold text-text-primary">Başarılı! 🎉</h1>
        </header>

        <div className="rounded-card border border-primary/50 bg-gradient-to-br from-surface-800 to-surface-900 p-6 shadow-lg shadow-primary/20">
          <div className="text-center">
            <p className="text-text-muted mb-2">Toplam Puan</p>
            <p className="font-display text-6xl font-bold text-primary">{score.totalScore}</p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <ScoreRow label="Temel Puan" value={score.baseScore} accent="blue" />
            {score.completionBonus > 0 && (
              <ScoreRow label="Tamamlama Bonusu" value={score.completionBonus} accent="amber" />
            )}
            {score.pausePenalty > 0 && (
              <ScoreRow label="Duraklatma Cezası" value={-score.pausePenalty} accent="red" />
            )}
            {score.roundMultiplier > 1 && (
              <ScoreRow label={`Tur Çarpanı (×${score.roundMultiplier.toFixed(1)})`} value={score.roundBonusPoints} accent="blue" />
            )}
            {score.streakBonus > 0 && (
              <ScoreRow label="Seri Bonusu" value={score.streakBonus} accent="amber" />
            )}
          </div>
        </div>

        {/* Arka plandaki mola banner — non-intrusive indicator */}
        {hasBackgroundBreak && breakRemainingMs > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 px-5 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span className="text-sm font-medium text-primary">Mola arka planda başladı</span>
            </div>
            <span className="font-mono text-lg font-bold tabular-nums text-primary">
              {formatSeconds(Math.round(breakRemainingMs / 1000))}
            </span>
          </div>
        )}
        {hasBackgroundBreak && breakRemainingMs <= 0 && (
          <div className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-5 py-3">
            <span className="text-sm font-medium text-primary">Mola süresi doldu — kayıt sonrası yeni tura geçeceksiniz</span>
          </div>
        )}

        <div className="space-y-3 rounded-card border border-text-primary/5 bg-surface-800/80 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-text-muted">Mod</p>
              <p className="font-semibold text-text-primary">{modes.find((m) => m.id === mode)?.title}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Net Çalışma</p>
              <p className="font-semibold text-text-primary">{formatSeconds(Math.round(elapsedMs / 1000))}</p>
            </div>
            {hasPauses && (
              <div>
                <p className="text-xs text-text-muted">Toplam Süre (duraklamalar dahil)</p>
                <p className="font-semibold text-primary">{formatSeconds(Math.round(totalDurationMs / 1000))}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-text-muted">Duraklatma {pauses > 0 ? `(${pauses}×)` : ''}</p>
              <p className="font-semibold text-text-primary">
                {pauses > 0
                  ? formatSeconds(Math.round(totalPauseDurationMs / 1000))
                  : 'Yok'}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Saat</p>
              <p className="font-semibold text-text-primary">
                {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>

        {isDeneme && onDenemeAnalizChange && (
          <div className="space-y-3 rounded-card border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-text-primary">Deneme analizi (opsiyonel)</p>
            <p className="text-xs text-text-muted">Doğru / yanlış / boş sayılarını gir; net ve trend istatistiklerde görünsün.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-text-muted">Doğru</label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={analiz.dogru}
                  onChange={(e) => setAnaliz({ dogru: clampNum(parseInt(e.target.value, 10) || 0, 0, 999) })}
                  className="w-full rounded-card border border-text-primary/10 bg-surface-800 px-3 py-2 text-center text-text-primary focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Yanlış</label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={analiz.yanlis}
                  onChange={(e) => setAnaliz({ yanlis: clampNum(parseInt(e.target.value, 10) || 0, 0, 999) })}
                  className="w-full rounded-card border border-text-primary/10 bg-surface-800 px-3 py-2 text-center text-text-primary focus:border-primary/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">Boş</label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={analiz.bos}
                  onChange={(e) => setAnaliz({ bos: clampNum(parseInt(e.target.value, 10) || 0, 0, 999) })}
                  className="w-full rounded-card border border-text-primary/10 bg-surface-800 px-3 py-2 text-center text-text-primary focus:border-primary/50 focus:outline-none"
                />
              </div>
            </div>
            {(analiz.dogru > 0 || analiz.yanlis > 0 || analiz.bos > 0) && (
              <p className="text-xs text-text-muted">
                Net (D − Y/4) = <span className="font-semibold text-primary">{((analiz.dogru || 0) - (analiz.yanlis || 0) / 4).toFixed(2)}</span>
              </p>
            )}
          </div>
        )}

        {onRuhHaliChange && (
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-text-primary">Bu seans nasıldı? (opsiyonel)</label>
            <div className="flex gap-2 flex-wrap">
              {RUH_HALI_OPTS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onRuhHaliChange(sessionRuhHali === o.value ? null : o.value)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    sessionRuhHali === o.value ? 'border-primary/60 bg-primary/20 text-primary' : 'border-text-primary/10 bg-surface-700/50 text-text-muted hover:border-primary/40'
                  }`}
                >
                  {o.emoji} {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text-primary">Seans Notu (opsiyonel)</label>
          <textarea
            value={sessionNote}
            onChange={(e) => onSessionNoteChange(e.target.value)}
            placeholder="Bu seans hakkında bir not yaz... (ör. 'Çok iyi konsantré oldum')"
            className="w-full rounded-card border border-text-primary/10 bg-surface-800/50 px-4 py-3 text-text-primary placeholder-text-muted focus:border-primary/50 focus:outline-none"
            rows={3}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onSave}
            className="flex-1 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/40 active:scale-[0.98] transition"
          >
            Kaydet ve Devam Et
          </button>
          <button
            onClick={onCancel}
            className="rounded-full border border-text-primary/10 px-6 py-3 font-semibold text-text-primary hover:border-primary/60 active:scale-[0.98] transition"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  )
}
