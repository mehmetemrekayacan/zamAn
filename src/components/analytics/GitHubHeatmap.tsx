import { useMemo } from 'react'
import { useSessionsStore } from '../../store/sessions'

import { formatSeconds, getLocalDateString, startOfLocalWeek } from '../../lib/time'
import { buildStudyStatistics, dailyStudyWindow } from '../../lib/studyStatistics'
import { dateForCalendar, useLocalCalendar } from '../../lib/localCalendarClock'

type HeatCell = { key: string; date: Date; minutes: number; levelClass: string }
type HeatWeek = { key: string; days: HeatCell[] }

function levelFromMinutes(minutes: number) {
  if (minutes <= 0) return 'opacity-20'
  if (minutes < 30) return 'opacity-40'
  if (minutes < 90) return 'opacity-60'
  if (minutes < 180) return 'opacity-80'
  return 'opacity-100'
}

export function GitHubHeatmap() {
  const sessions = useSessionsStore((state) => state.sessions)

  const calendar = useLocalCalendar()
  const { weeks, totalMinutes } = useMemo(() => {
    const now = dateForCalendar(calendar)
    const stats = buildStudyStatistics(sessions, now)
    const cells: HeatCell[] = dailyStudyWindow(stats.dailySeconds, 365, now).map(({ dayKey, date, seconds }) => ({
      key: dayKey, date, minutes: seconds / 60, levelClass: levelFromMinutes(seconds / 60),
    }))
    const groups = new Map<string, HeatCell[]>()
    for (const cell of cells) {
      const key = getLocalDateString(startOfLocalWeek(cell.date))
      groups.set(key, [...(groups.get(key) ?? []), cell])
    }
    const weeks: HeatWeek[] = [...groups].map(([key, days]) => ({ key, days }))
    return { weeks, totalMinutes: Math.round(cells.reduce((sum, cell) => sum + cell.minutes, 0)) }
  }, [sessions, calendar])

  return (
    <div className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">İstikrar Haritası (365 Gün)</h3>
        <span className="text-xs text-muted">Toplam {totalMinutes} dk</span>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex gap-1">
          {weeks.map((week) => (
            <div key={week.key} className="grid grid-rows-7 gap-1">
              {week.days.map((day) => (
                <div
                  key={day.key}
                  className={`h-3.5 w-3.5 rounded-sm ${day.levelClass}`}
                  style={{ backgroundColor: 'var(--success)', gridRow: ((day.date.getDay() + 6) % 7) + 1 }}
                  title={`${day.date.toLocaleDateString('tr-TR')}: ${formatSeconds(Math.round(day.minutes * 60))}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 text-[11px] text-muted">
        <span>Az</span>
        <span className="h-3 w-3 rounded-sm opacity-20" style={{ backgroundColor: 'var(--success)' }} />
        <span className="h-3 w-3 rounded-sm opacity-40" style={{ backgroundColor: 'var(--success)' }} />
        <span className="h-3 w-3 rounded-sm opacity-60" style={{ backgroundColor: 'var(--success)' }} />
        <span className="h-3 w-3 rounded-sm opacity-80" style={{ backgroundColor: 'var(--success)' }} />
        <span className="h-3 w-3 rounded-sm opacity-100" style={{ backgroundColor: 'var(--success)' }} />
        <span>Çok</span>
      </div>
    </div>
  )
}
