import { memo } from 'react'

export interface StatCardProps {
  label: string
  value: string
  hint: string
  tone?: 'primary' | 'info' | 'warning' | 'success'
}

const toneMap = {
  primary: 'text-primary',
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
}

export const StatCard = memo(function StatCard({ label, value, hint, tone = 'primary' }: StatCardProps) {
  return (
    <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-primary/10">
      <p className="text-xs uppercase tracking-widest text-text-muted">{label}</p>
      <p className={`font-display text-2xl ${toneMap[tone]}`}>{value}</p>
      <p className="text-sm text-text-muted">{hint}</p>
    </div>
  )
})
