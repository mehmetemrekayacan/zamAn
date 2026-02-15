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
    blue: 'text-accent-blue',
    red: 'text-accent-red',
    amber: 'text-accent-amber',
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
}

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
}: FinishScreenProps) {
  const isDeneme = mode === 'deneme'
  const analiz = denemeAnaliz ?? { dogru: 0, yanlis: 0, bos: 0 }
  const setAnaliz = (next: Partial<DenemeAnalizType>) => {
    if (onDenemeAnalizChange) {
      onDenemeAnalizChange({ ...analiz, ...next })
    }
  }
  return (
    <div className="min-h-screen bg-surface-900 text-text-primary">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <header>
          <p className="text-sm uppercase tracking-widest text-text-muted">Seans Tamamlandı</p>
          <h1 className="font-display text-3xl font-semibold text-text-primary">Başarılı! 🎉</h1>
        </header>

        <div className="rounded-card border border-accent-blue/50 bg-gradient-to-br from-surface-800 to-surface-900 p-6 shadow-lg shadow-blue-500/20">
          <div className="text-center">
            <p className="text-text-muted mb-2">Toplam Puan</p>
            <p className="font-display text-6xl font-bold text-accent-blue">{score.totalScore}</p>
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

        <div className="space-y-3 rounded-card border border-text-primary/5 bg-surface-800/80 p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-text-muted">Mod</p>
              <p className="font-semibold text-text-primary">{modes.find((m) => m.id === mode)?.title}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Geçen Süre</p>
              <p className="font-semibold text-text-primary">{formatSeconds(Math.round(elapsedMs / 1000))}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Duraklatma Sayısı</p>
              <p className="font-semibold text-text-primary">{pauses}</p>
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
          <div className="space-y-3 rounded-card border border-accent-amber/30 bg-accent-amber/5 p-4">
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
                  className="w-full rounded-card border border-text-primary/10 bg-surface-800 px-3 py-2 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
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
                  className="w-full rounded-card border border-text-primary/10 bg-surface-800 px-3 py-2 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
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
                  className="w-full rounded-card border border-text-primary/10 bg-surface-800 px-3 py-2 text-center text-text-primary focus:border-accent-blue/50 focus:outline-none"
                />
              </div>
            </div>
            {(analiz.dogru > 0 || analiz.yanlis > 0 || analiz.bos > 0) && (
              <p className="text-xs text-text-muted">
                Net (D − Y/4) = <span className="font-semibold text-accent-amber">{((analiz.dogru || 0) - (analiz.yanlis || 0) / 4).toFixed(2)}</span>
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
                    sessionRuhHali === o.value ? 'border-accent-amber/60 bg-accent-amber/20 text-text-primary' : 'border-text-primary/10 bg-surface-700/50 text-text-muted hover:border-accent-amber/40'
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
            className="w-full rounded-card border border-text-primary/10 bg-surface-800/50 px-4 py-3 text-text-primary placeholder-text-muted focus:border-accent-blue/50 focus:outline-none"
            rows={3}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onSave}
            className="flex-1 rounded-full bg-accent-blue px-6 py-3 font-semibold text-surface-900 shadow-lg shadow-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/40 active:scale-[0.98] transition"
          >
            Kaydet ve Devam Et
          </button>
          <button
            onClick={onCancel}
            className="rounded-full border border-text-primary/10 px-6 py-3 font-semibold text-text-primary hover:border-accent-blue/60 active:scale-[0.98] transition"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  )
}
