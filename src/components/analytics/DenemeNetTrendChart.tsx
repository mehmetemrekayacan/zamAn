import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useSessionsStore } from '../../store/sessions'
import type { SessionRecord } from '../../types'
import { getDenemeTemplateName } from '../../lib/utils'

type NetPoint = {
  id: string
  label: string
  net: number
  dateMs: number
}

function toDate(session: SessionRecord) {
  const raw = session.createdAt ?? session.tarihISO
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}

function hasDenemeNetValues(session: SessionRecord) {
  return session.mod === 'deneme'
    && typeof session.dogruSayisi === 'number'
    && typeof session.yanlisSayisi === 'number'
}

export function DenemeNetTrendChart() {
  const sessions = useSessionsStore((state) => state.sessions)

  // Sadece ilgili değerlere sahip mod === 'deneme' seansları
  const denemeSessions = useMemo(() => {
    return sessions.filter(hasDenemeNetValues)
  }, [sessions])

  // Bugüne kadar çözülmüş tüm benzersiz şablon isimlerini bul
  const templateStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const session of denemeSessions) {
      const templateName = getDenemeTemplateName(session)
      counts.set(templateName, (counts.get(templateName) || 0) + 1)
    }
    // En çok çözülenden en aza sıralı
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [denemeSessions])

  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('')

  // Seçili template silinmişse otomatik olarak ilk mevcut template'e düş.
  const effectiveTemplateName = useMemo(() => {
    if (templateStats.length === 0) return ''
    if (selectedTemplateName && templateStats.some((t) => t.name === selectedTemplateName)) {
      return selectedTemplateName
    }
    return templateStats[0].name
  }, [templateStats, selectedTemplateName])

  // Seçili derse göre filtrelenmiş Chart Verisi
  const data = useMemo<NetPoint[]>(() => {
    if (!effectiveTemplateName) return []
    
    return denemeSessions
      .filter((s) => getDenemeTemplateName(s) === effectiveTemplateName)
      .map((session) => {
        const date = toDate(session)
        if (!date) return null

        const dogru = session.dogruSayisi || 0
        const yanlis = session.yanlisSayisi || 0
        const net = dogru - (yanlis / 4)

        return {
          id: session.id,
          label: date.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: 'short',
          }),
          net: Math.round(net * 100) / 100,
          dateMs: date.getTime(),
        }
      })
      .filter((item): item is NetPoint => item !== null)
      .sort((a, b) => a.dateMs - b.dateMs)
  }, [denemeSessions, effectiveTemplateName])

  return (
    <div className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 flex flex-col min-h-[380px]">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Deneme Sınavı Net Trendi</h3>
          <span className="text-xs text-muted">Net = Doğru - (Yanlış / 4)</span>
        </div>

        {/* Dinamik Dropdown - Dark Modern Tailwind */}
        {templateStats.length > 0 && (
          <div className="relative shrink-0">
            <select
              value={effectiveTemplateName}
              onChange={(e) => setSelectedTemplateName(e.target.value)}
              className="appearance-none w-full sm:w-48 outline-none rounded-xl border border-muted/20 bg-surface-800 px-4 py-2 pr-10 text-sm font-medium text-foreground shadow-sm ring-1 ring-inset ring-muted/10 focus:ring-2 focus:ring-success/50 transition truncate"
            >
              {templateStats.map((stat) => (
                <option key={stat.name} value={stat.name} className="bg-surface-800 text-foreground">
                  {stat.name} ({stat.count})
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-muted">
              <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
                 <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      <div className="w-full h-72 min-h-[300px] mt-2">
        {/* Empty State */}
        {templateStats.length === 0 ? (
          <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-muted/20 bg-surface-900/40">
            <span className="text-4xl mb-3 opacity-60">📉</span>
            <p className="text-sm font-medium text-foreground/80">Net analizi yapılamıyor</p>
            <p className="text-xs text-muted mt-1 max-w-[200px] mx-auto">
              Henüz "Doğru/Yanlış" girilmiş bir deneme seansınız bulunmuyor.
            </p>
          </div>
        ) : data.length < 2 ? (
          <div className="h-full w-full flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-muted/20 bg-surface-900/40">
            <span className="text-4xl mb-3 opacity-60">📉</span>
            <p className="text-sm font-medium text-foreground/80">Yeterli veri yok</p>
            <p className="text-xs text-muted mt-1 max-w-[200px] mx-auto">
              Trend çizgisinin oluşması için bu derste en az 2 deneme verisi gerekiyor.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="id"
                tick={{ fill: 'var(--chart-text)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--chart-grid)' }}
                tickLine={false}
                tickFormatter={(id) => data.find((d) => d.id === id)?.label || ''}
              />
              <YAxis
                tick={{ fill: 'var(--chart-text)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--chart-grid)' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '0.75rem',
                  color: 'var(--card-foreground)',
                }}
                formatter={(value: number | string | undefined) => [Number(value ?? 0).toFixed(2), 'Net']}
                labelFormatter={(id) => {
                  const item = data.find((d) => d.id === id)
                  return `Tarih: ${item?.label || ''}`
                }}
              />
              <Line
                type="monotone"
                dataKey="net"
                stroke="var(--success)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'var(--success)' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
