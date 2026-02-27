import { useMemo } from 'react'
import { useSessionsStore } from '../../store/sessions'

type HeatCell = {
  key: string
  date: Date
  minutes: number
  levelClass: string
}

type HeatWeek = {
  key: string
  days: HeatCell[]
}

const DAYS = 365

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function toValidDate(raw?: string) {
  const date = raw ? new Date(raw) : null
  if (!date || Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

function levelFromMinutes(minutes: number) {
  if (minutes <= 0) return 'bg-gray-800'
  if (minutes < 30) return 'bg-emerald-900'
  if (minutes < 90) return 'bg-emerald-700'
  if (minutes < 180) return 'bg-emerald-600'
  return 'bg-emerald-500'
}

export function GitHubHeatmap() {
  const sessions = useSessionsStore((state) => state.sessions)

  const { weeks, totalMinutes } = useMemo(() => {
    const now = new Date()
    const today = startOfDay(now)
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - (DAYS - 1))

    const dailySeconds = new Map<string, number>()

    for (let i = 0; i < DAYS; i += 1) {
      const day = new Date(startDate)
      day.setDate(startDate.getDate() + i)
      dailySeconds.set(day.toISOString().slice(0, 10), 0)
    }

    for (const session of sessions) {
      const date = toValidDate(session.createdAt ?? session.tarihISO)
      if (!date || date < startDate || date > now) {
        continue
      }

      const day = startOfDay(date)
      const key = day.toISOString().slice(0, 10)
      if (!dailySeconds.has(key)) {
        continue
      }

      dailySeconds.set(key, (dailySeconds.get(key) ?? 0) + Math.max(session.sureGercek ?? 0, 0))
    }

    const cells: HeatCell[] = Array.from(dailySeconds.entries()).map(([key, seconds]) => {
      const minutes = Math.round(seconds / 60)
      const date = new Date(`${key}T00:00:00`)
      return {
        key,
        date,
        minutes,
        levelClass: levelFromMinutes(minutes),
      }
    })

    const weekGroups = new Map<string, HeatCell[]>()
    for (const cell of cells) {
      const weekStart = new Date(cell.date)
      const dayOfWeek = weekStart.getDay()
      weekStart.setDate(weekStart.getDate() - dayOfWeek)
      const weekKey = weekStart.toISOString().slice(0, 10)
      const existing = weekGroups.get(weekKey) ?? []
      existing.push(cell)
      weekGroups.set(weekKey, existing)
    }

    const weeksData: HeatWeek[] = Array.from(weekGroups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekKey, days]) => ({
        key: weekKey,
        days: [...days].sort((a, b) => a.date.getDay() - b.date.getDay()),
      }))

    return {
      weeks: weeksData,
      totalMinutes: cells.reduce((sum, cell) => sum + cell.minutes, 0),
    }
  }, [sessions])

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">İstikrar Haritası (365 Gün)</h3>
        <span className="text-xs text-white/60">Toplam {totalMinutes} dk</span>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex gap-1">
          {weeks.map((week) => (
            <div key={week.key} className="grid grid-rows-7 gap-1">
              {week.days.map((day) => (
                <div
                  key={day.key}
                  className={`h-3.5 w-3.5 rounded-sm ${day.levelClass}`}
                  title={`${day.date.toLocaleDateString('tr-TR')}: ${day.minutes} dk`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 text-[11px] text-white/60">
        <span>Az</span>
        <span className="h-3 w-3 rounded-sm bg-gray-800" />
        <span className="h-3 w-3 rounded-sm bg-emerald-900" />
        <span className="h-3 w-3 rounded-sm bg-emerald-700" />
        <span className="h-3 w-3 rounded-sm bg-emerald-600" />
        <span className="h-3 w-3 rounded-sm bg-emerald-500" />
        <span>Çok</span>
      </div>
    </div>
  )
}
