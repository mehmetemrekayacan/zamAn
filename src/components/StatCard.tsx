import { memo } from 'react'

export interface StatCardProps {
  label: string
  value: string
  hint: string
}

export const StatCard = memo(function StatCard({ label, value, hint }: StatCardProps) {
  return (
    <div className="rounded-card border border-text-primary/5 bg-surface-800/80 p-4 shadow-lg shadow-accent-blue/5">
      <p className="text-xs uppercase tracking-widest text-text-muted">{label}</p>
      <p className="font-display text-2xl text-text-primary">{value}</p>
      <p className="text-sm text-text-muted">{hint}</p>
    </div>
  )
})
