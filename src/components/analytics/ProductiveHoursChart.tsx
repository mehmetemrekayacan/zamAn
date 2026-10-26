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

import { buildStudyStatistics } from '../../lib/studyStatistics'
import { dateForCalendar, useLocalCalendar } from '../../lib/localCalendarClock'
import { formatSeconds } from '../../lib/time'

export function ProductiveHoursChart() {
  const sessions = useSessionsStore((state) => state.sessions)
  const calendar = useLocalCalendar()
  const data = useMemo(() => buildStudyStatistics(sessions, dateForCalendar(calendar)).hourSeconds.map((seconds, hour) => ({
    hour, label: `${String(hour).padStart(2, '0')}:00`, minutes: seconds / 60,
  })), [sessions, calendar])

  return (
    <div className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Saatlere Göre Çalışma</h3>
        <span className="text-xs text-muted">Tüm kayıtlar · yerel saat</span>
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
              formatter={(value: number | string | undefined) => [formatSeconds(Math.round(Number(value ?? 0) * 60)), 'Toplam çalışma']}
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
