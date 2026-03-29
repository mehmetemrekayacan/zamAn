import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useSessionsStore } from '../../store/sessions'

type HourPoint = {
  hour: number
  label: string
  minutes: number
}

function toValidDate(dateRaw?: string) {
  const date = dateRaw ? new Date(dateRaw) : null
  if (!date || Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

export function ProductiveHoursChart() {
  const sessions = useSessionsStore((state) => state.sessions)

  const data = useMemo<HourPoint[]>(() => {
    const buckets = new Array<number>(24).fill(0)

    for (const session of sessions) {
      const sessionDate = toValidDate(session.createdAt ?? session.tarihISO)
      if (!sessionDate) {
        continue
      }

      const hour = sessionDate.getHours()
      buckets[hour] += Math.max(session.sureGercek ?? 0, 0)
    }

    return buckets.map((seconds, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      minutes: Math.round(seconds / 60),
    }))
  }, [sessions])

  return (
    <div className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Günün En Verimli Saati</h3>
        <span className="text-xs text-muted">24 saat dağılımı</span>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%" minHeight={250}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--chart-text)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              tickLine={false}
              interval={2}
            />
            <YAxis
              tick={{ fill: 'var(--chart-text)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
              contentStyle={{
                background: 'var(--card)',
                border: '1px solid var(--card-border)',
                borderRadius: '0.75rem',
                color: 'var(--card-foreground)',
              }}
              formatter={(value: number | string | undefined) => [`${Number(value ?? 0)} dk`, 'Toplam çalışma']}
              labelFormatter={(label) => `Saat: ${label}`}
            />
            <Bar
              dataKey="minutes"
              radius={[6, 6, 0, 0]}
              fill="var(--info)"
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
