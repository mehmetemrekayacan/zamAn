import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Mobil Bottom Sheet — iOS/Android tarzı sürüklenebilir alt panel.
 *
 * 3 snap noktası:
 *   peek  → yalnızca tutma çubuğu + özet satırı (~72px)
 *   half  → ekranın %50'si
 *   full  → ekranın %90'ı
 *
 * lg ve üstü ekranlarda gizlenir (children doğrudan render).
 */

type SnapPoint = 'peek' | 'half' | 'full'

const PEEK_HEIGHT = 72         // px — sadece handle + özet
const HALF_RATIO = 0.50        // ekran yüksekliğinin %50'si
const FULL_RATIO = 0.90        // ekranın %90'ı
const DRAG_THRESHOLD = 40      // snap geçişi için minimum px

export interface BottomSheetProps {
  /** Özet satırı — peek durumunda gösterilir */
  summary: ReactNode
  children: ReactNode
}

export const BottomSheet = memo(function BottomSheet({
  summary,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const [snap, setSnap] = useState<SnapPoint>('peek')
  const [dragging, setDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const startY = useRef(0)
  const startHeight = useRef(0)

  /* ── yükseklik hesaplama ── */
  const getSnapHeight = useCallback((s: SnapPoint) => {
    const vh = window.innerHeight
    switch (s) {
      case 'peek': return PEEK_HEIGHT
      case 'half': return Math.round(vh * HALF_RATIO)
      case 'full': return Math.round(vh * FULL_RATIO)
    }
  }, [])

  const currentHeight = getSnapHeight(snap) + (dragging ? -dragOffset : 0)

  /* ── Touch handlers — sürükleme ── */
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // İçerik kaydırması varsa sheet'i sürükleme
    const target = e.target as HTMLElement
    const scrollableParent = target.closest('[data-sheet-content]')
    if (scrollableParent && scrollableParent.scrollTop > 0) return

    startY.current = e.touches[0].clientY
    startHeight.current = getSnapHeight(snap)
    setDragging(true)
  }, [snap, getSnapHeight])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging) return
    const dy = e.touches[0].clientY - startY.current
    setDragOffset(dy)
  }, [dragging])

  const handleTouchEnd = useCallback(() => {
    if (!dragging) return
    setDragging(false)

    const moved = -dragOffset // negatif = yukarı sürükleme
    const snaps: SnapPoint[] = ['peek', 'half', 'full']
    const idx = snaps.indexOf(snap)

    if (moved > DRAG_THRESHOLD && idx < snaps.length - 1) {
      // Yukarı sürüklendi → bir üst snap
      setSnap(snaps[idx + 1])
    } else if (moved < -DRAG_THRESHOLD && idx > 0) {
      // Aşağı sürüklendi → bir alt snap
      setSnap(snaps[idx - 1])
    }

    setDragOffset(0)
  }, [dragging, dragOffset, snap])

  /* ── Handle'a tıklama → snap geçişi ── */
  const handleTap = useCallback(() => {
    const next: Record<SnapPoint, SnapPoint> = {
      peek: 'half',
      half: 'full',
      full: 'peek',
    }
    setSnap(next[snap])
  }, [snap])

  /* ── Escape ile küçült ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && snap !== 'peek') setSnap('peek')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [snap])

  return (
    <>
      {/* Overlay (half veya full durumda) */}
      {snap !== 'peek' && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden"
          onClick={() => setSnap('peek')}
        />
      )}

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl
                   border-t border-[var(--card-border)] bg-surface-800
                   shadow-[0_-4px_24px_rgba(0,0,0,0.4)]
                   lg:hidden"
        style={{
          height: `${Math.max(PEEK_HEIGHT, currentHeight)}px`,
          transition: dragging ? 'none' : 'height 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'height',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle bar */}
        <button
          type="button"
          onClick={handleTap}
          className="flex flex-col items-center gap-2 px-4 pb-2 pt-3 focus:outline-none"
          aria-label="Bottom sheet'i aç/kapat"
        >
          <span className="h-1 w-10 rounded-full bg-text-muted/40" />
          {/* Peek özet satırı */}
          <div
            className={`w-full text-center text-sm text-text-muted transition-opacity duration-200 ${
              snap === 'peek' ? 'opacity-100' : 'opacity-60'
            }`}
          >
            {summary}
          </div>
        </button>

        {/* İçerik */}
        <div
          data-sheet-content
          className={`flex-1 overflow-y-auto overscroll-contain px-4 pb-6
                      ${snap === 'peek' ? 'pointer-events-none opacity-0' : 'opacity-100'}
                      transition-opacity duration-200`}
        >
          {children}
        </div>
      </div>

      {/* Peek durumda altta padding bırak ki içerik sheet'in arkasında kalmasın */}
      <div className="h-20 lg:hidden" />
    </>
  )
})
