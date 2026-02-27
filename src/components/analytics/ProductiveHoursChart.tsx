import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

  const peakMinutes = useMemo(() => Math.max(0, ...data.map((item) => item.minutes)), [data])

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Günün En Verimli Saati</h3>
        <span className="text-xs text-white/60">24 saat dağılımı</span>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
              tickLine={false}
              interval={2}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{
                background: 'rgba(17, 24, 39, 0.9)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0.75rem',
                color: '#fff',
              }}
              formatter={(value: number | string | undefined) => [`${Number(value ?? 0)} dk`, 'Toplam çalışma']}
              labelFormatter={(label) => `Saat: ${label}`}
            />
            <Bar dataKey="minutes" radius={[6, 6, 0, 0]}>
              {data.map((entry) => {
                const isPeak = peakMinutes > 0 && entry.minutes === peakMinutes
                return <Cell key={entry.hour} fill={isPeak ? '#10b981' : '#059669'} />
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
