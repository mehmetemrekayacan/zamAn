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

      <details>
        <summary className="w-fit cursor-pointer rounded-md text-xs font-medium text-text-muted transition hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          <span aria-hidden="true">ⓘ </span>Veriler nasıl hesaplanıyor?
        </summary>
        <div className="mt-3 max-w-3xl space-y-2 border-l border-text-primary/10 pl-3 text-xs leading-relaxed text-text-muted">
          <p>Süreler çalışılan güne; seans sayısı ve puanlar bitiş gününe göre hesaplanır. Yeni kayıtların süreleri, duraklamalar çıkarılarak gerçek çalışma aralıklarına dağıtılır.</p>
          {legacyCount > 0 && <p>{legacyCount} eski kaydın çalışma aralıkları bulunmadığından süreleri bitiş gününe ve saatine yazılır.</p>}
        </div>
      </details>

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
