import { memo } from 'react'

export interface QuickStat {
  label: string
  value: string
  hint: string
  accent?: 'blue' | 'amber' | 'cyan'
}

export interface QuickStatsBarProps {
  stats: QuickStat[]
}

const accentMap = {
  blue: 'text-accent-blue',
  amber: 'text-accent-amber',
  cyan: 'text-accent-cyan',
}

/**
 * Yatay istatistik çubuğu — Header altında compact görünüm.
 * 4 istatistik hücresini eşit bölüy divider ile ayırır.
 */
export const QuickStatsBar = memo(function QuickStatsBar({
  stats,
}: QuickStatsBarProps) {
  return (
    <div
      className="grid rounded-2xl border border-text-primary/5 bg-surface-800/50 shadow-md shadow-black/10"
      style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`flex flex-col items-center gap-0.5 px-3 py-4 sm:px-5 ${
            i > 0 ? 'border-l border-text-primary/5' : ''
          }`}
        >
          <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted">
            {s.label}
          </p>
          <p className={`font-display text-xl font-bold sm:text-2xl ${accentMap[s.accent ?? 'blue']}`}>
            {s.value}
          </p>
          <p className="text-[11px] text-text-muted">{s.hint}</p>
        </div>
      ))}
    </div>
  )
})
