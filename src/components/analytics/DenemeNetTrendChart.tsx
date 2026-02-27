import { useMemo } from 'react'
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

  const data = useMemo<NetPoint[]>(() => {
    return sessions
      .filter(hasDenemeNetValues)
      .map((session) => {
        const date = toDate(session)
        if (!date) {
          return null
        }

        const net = session.dogruSayisi! - session.yanlisSayisi! / 4

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
  }, [sessions])

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Deneme Sınavı Net Trendi</h3>
        <span className="text-xs text-white/60">Net = Doğru - (Yanlış / 4)</span>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(17, 24, 39, 0.9)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0.75rem',
                color: '#fff',
              }}
              formatter={(value: number | string | undefined) => [Number(value ?? 0).toFixed(2), 'Net']}
              labelFormatter={(label) => `Tarih: ${label}`}
            />
            <Line
              type="monotone"
              dataKey="net"
              stroke="#34d399"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#34d399' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
