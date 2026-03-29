import { memo } from 'react'

export interface QuickStat {
  label: string
  value: string
  hint: string
  tone?: 'primary' | 'info' | 'warning' | 'success'
}

export interface QuickStatsBarProps {
  stats: QuickStat[]
}

const accentMap = {
  primary: 'text-primary',
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
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
      className="card grid"
      style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className={`flex flex-col items-center gap-1 px-3 py-5 sm:px-5 ${
            i > 0 ? 'border-l border-[var(--card-border)]' : ''
          }`}
        >
          <p className="section-label">
            {s.label}
          </p>
          <p className={`font-display text-xl font-bold sm:text-2xl ${accentMap[s.tone ?? 'primary']}`}>
            {s.value}
          </p>
          <p className="text-[11px] text-text-muted">{s.hint}</p>
        </div>
      ))}
    </div>
  )
})
