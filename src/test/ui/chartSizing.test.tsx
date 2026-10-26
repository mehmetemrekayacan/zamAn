// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { DailyStudyChart } from '../../components/analytics/DailyStudyChart'
import { ProductiveHoursChart } from '../../components/analytics/ProductiveHoursChart'
import { DenemeNetTrendChart } from '../../components/analytics/DenemeNetTrendChart'
import { useSessionsStore } from '../../store/sessions'
import { makeSession } from '../helpers/fixtures'

it.each([
  { name: 'Günlük çalışma', Chart: DailyStudyChart, height: 288 },
  { name: 'Verimli saatler', Chart: ProductiveHoursChart, height: 288 },
  { name: 'Deneme net trendi', Chart: DenemeNetTrendChart, height: 300 },
])('$name: ölçüm öncesi/gizli alanda uyarı üretmez; görünür olunca çizilir ve daralır', async ({ Chart, height }) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const warnings = vi.spyOn(console, 'warn')
  const observers: TestResizeObserver[] = []
  class TestResizeObserver {
    target?: Element
    private callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) { this.callback = callback; observers.push(this) }
    observe(target: Element) { this.target = target }
    unobserve() {}
    disconnect() { this.target = undefined }
    emit(width: number) {
      this.callback([{ target: this.target!, contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  const originalSessions = useSessionsStore.getState().sessions
  useSessionsStore.setState({ sessions: [
    makeSession({ id: 'chart-1', mod: 'deneme', templateName: 'AGS', dogruSayisi: 50, yanlisSayisi: 4 }),
    makeSession({ id: 'chart-2', mod: 'deneme', templateName: 'AGS', dogruSayisi: 55, yanlisSayisi: 4, tarihISO: '2026-10-25T09:00:00Z' }),
  ] })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const sizeWarnings = () => warnings.mock.calls.filter(([message]) => String(message).includes('of chart should be greater than 0'))
  try {
    // jsdom başlangıçta sıfır yerleşim ölçüsü verir; Recharts gerçek bileşendir.
    await act(async () => root.render(<Chart />))
    expect(sizeWarnings()).toHaveLength(0)
    expect(container.querySelector('svg.recharts-surface')).toBeNull()
    const responsive = container.querySelector('.recharts-responsive-container')!
    const observer = observers.find(item => item.target === responsive)!
    expect(observer).toBeDefined()
    for (const width of [640, 280]) {
      await act(async () => observer.emit(width))
      const svg = container.querySelector('svg.recharts-surface')!
      expect(svg.getAttribute('width')).toBe(String(width))
      expect(svg.getAttribute('height')).toBe(String(height))
    }
    await act(async () => observer.emit(0))
    expect(container.querySelector('svg.recharts-surface')).toBeNull()
    expect(sizeWarnings()).toHaveLength(0)
  } finally {
    await act(async () => root.unmount())
    expect(observers.every(item => !item.target)).toBe(true)
    container.remove()
    useSessionsStore.setState({ sessions: originalSessions })
  }
})
