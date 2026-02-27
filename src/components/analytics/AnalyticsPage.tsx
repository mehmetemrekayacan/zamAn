import { DailyStudyChart } from './DailyStudyChart'
import { ProductiveHoursChart } from './ProductiveHoursChart'
import { DenemeNetTrendChart } from './DenemeNetTrendChart'
import { GitHubHeatmap } from './GitHubHeatmap'

export function AnalyticsPage() {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-text-primary sm:text-2xl">İstatistikler</h2>
        <p className="text-xs text-text-muted sm:text-sm">Çalışma verilerinin detaylı görünümü</p>
      </div>

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
