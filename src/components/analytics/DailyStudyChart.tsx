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
import { useStudyStatistics } from '../../lib/useStudyStatistics'

import { dailyStudyWindow } from '../../lib/studyStatistics'
import { dateForCalendar, useLocalCalendar } from '../../lib/localCalendarClock'
import { formatSeconds } from '../../lib/time'

export function DailyStudyChart() {
  const stats = useStudyStatistics()
  const calendar = useLocalCalendar()
  const data = useMemo(() => {
    const now = dateForCalendar(calendar)
    return dailyStudyWindow(stats.dailySeconds, 30, now).map(({ dayKey, date, seconds }) => ({
      dayKey, dayLabel: date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }), minutes: seconds / 60,
    }))
  }, [stats, calendar])

  return (
    <div className="min-w-0 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Son 30 Gün · Günlük Çalışma</h3>
        <span className="text-xs text-muted">Dakika</span>
      </div>

      <div className="min-w-0 w-full">
        <ResponsiveContainer width="100%" height={288} minWidth={0}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey="dayLabel"
              tick={{ fill: 'var(--chart-text)', fontSize: 11 }}
              interval={4}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              tickLine={false}
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
              formatter={(value: number | string | undefined) => [formatSeconds(Math.round(Number(value ?? 0) * 60)), 'Çalışma']}
              labelFormatter={(label) => `Gün: ${label}`}
            />
            <Bar dataKey="minutes" radius={[8, 8, 0, 0]} fill="var(--primary)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
