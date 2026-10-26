import { DailyStudyChart } from './DailyStudyChart'
import { ProductiveHoursChart } from './ProductiveHoursChart'
import { DenemeNetTrendChart } from './DenemeNetTrendChart'
import { GitHubHeatmap } from './GitHubHeatmap'
import { useMemo } from 'react'
import { useSessionsStore } from '../../store/sessions'
import { buildStudyStatistics } from '../../lib/studyStatistics'
import { dateForCalendar, useLocalCalendar } from '../../lib/localCalendarClock'

export function AnalyticsPage() {
  const sessions = useSessionsStore((state) => state.sessions)
  const calendar = useLocalCalendar()
  const legacyCount = useMemo(() => buildStudyStatistics(sessions, dateForCalendar(calendar)).legacySessions, [sessions, calendar])
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-text-primary sm:text-2xl">İstatistikler</h2>
        <p className="text-xs text-text-muted sm:text-sm">Çalışma verilerinin detaylı görünümü</p>
      </div>

      <p className="text-xs text-text-muted">Süreler çalışılan güne; seans sayısı ve puanlar bitiş gününe göre hesaplanır.</p>
      {legacyCount > 0 && <p className="text-xs text-text-muted">{legacyCount} eski kaydın çalışma aralıkları bulunmadığından süreleri bitiş gününe ve saatine yazılır. Yeni kayıtlar duraklamalar çıkarılarak gerçek çalışma aralıklarına dağıtılır.</p>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <GitHubHeatmap />
        </div>

        <DailyStudyChart />
        <ProductiveHoursChart />

        <div className="md:col-span-2">
          <DenemeNetTrendChart />
        </div>
      </div>
    </section>
  )
}
