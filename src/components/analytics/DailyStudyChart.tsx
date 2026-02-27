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

type DailyStudyPoint = {
  dayKey: string
  dayLabel: string
  minutes: number
}

const DAY_COUNT = 30

function toSessionDate(sessionDateRaw?: string) {
  const parsed = sessionDateRaw ? new Date(sessionDateRaw) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function DailyStudyChart() {
  const sessions = useSessionsStore((state) => state.sessions)

  const data = useMemo<DailyStudyPoint[]>(() => {
    const now = new Date()
    const todayStart = startOfDay(now)
    const startWindow = new Date(todayStart)
    startWindow.setDate(startWindow.getDate() - (DAY_COUNT - 1))

    const map = new Map<string, number>()

    for (let i = 0; i < DAY_COUNT; i += 1) {
      const day = new Date(startWindow)
      day.setDate(startWindow.getDate() + i)
      const key = day.toISOString().slice(0, 10)
      map.set(key, 0)
    }

    for (const session of sessions) {
      const baseDate = toSessionDate(session.createdAt ?? session.tarihISO)
      if (!baseDate || baseDate < startWindow || baseDate > now) {
        continue
      }

      const day = startOfDay(baseDate)
      const key = day.toISOString().slice(0, 10)
      if (!map.has(key)) {
        continue
      }

      const nextSeconds = map.get(key)! + Math.max(session.sureGercek ?? 0, 0)
      map.set(key, nextSeconds)
    }

    return Array.from(map.entries()).map(([dayKey, totalSeconds]) => {
      const date = new Date(`${dayKey}T00:00:00`)
      const dayLabel = date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'short',
      })

      return {
        dayKey,
        dayLabel,
        minutes: Math.round(totalSeconds / 60),
      }
    })
  }, [sessions])

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Son 1 Ay Günlük Çalışma Süresi</h3>
        <span className="text-xs text-white/60">Dakika</span>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis
              dataKey="dayLabel"
              tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }}
              interval={4}
              axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
              tickLine={false}
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
              formatter={(value: number | string | undefined) => [`${Number(value ?? 0)} dk`, 'Çalışma']}
              labelFormatter={(label) => `Gün: ${label}`}
            />
            <Bar dataKey="minutes" radius={[8, 8, 0, 0]} fill="#34d399" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
