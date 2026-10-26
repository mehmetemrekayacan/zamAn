import { Component, Suspense, type ReactNode } from 'react'

/** Ağ/güncelleme sırasında bir ekran paketi yüklenemezse gezinme açık kalır. */
export class LazyContent extends Component<{ children: ReactNode; fallback: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (this.state.failed) return (
      <div role="alert" className="rounded-2xl border border-text-primary/15 bg-surface-800 p-6 text-text-primary">
        <p>Bu ekran yüklenemedi. Bağlantını kontrol edip yeniden deneyebilirsin.</p>
        <div className="mt-4 flex gap-3">
          <button type="button" onClick={this.props.onClose} className="rounded-full border border-text-primary/15 px-4 py-2">Geri dön</button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-full bg-primary px-4 py-2 text-primary-foreground">Yeniden yükle</button>
        </div>
      </div>
    )
    return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>
  }
}
