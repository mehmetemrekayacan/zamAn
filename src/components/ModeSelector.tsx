import { memo, useRef, useState, useEffect } from 'react'
import type { ModeConfig } from '../types'

const modes = [
  { id: 'serbest' as const, emoji: '⏱️', title: 'Kronometre', desc: 'Serbest zamanlama' },
  { id: 'gerisayim' as const, emoji: '⏳', title: 'Zamanlayıcı', desc: 'Geri sayım' },
  { id: 'ders60mola15' as const, emoji: '🍅', title: '60 / 15', desc: 'Ders / mola döngüsü' },
  { id: 'deneme' as const, emoji: '📋', title: 'Deneme', desc: 'Sınav simülasyonu' },
] as const

export interface ModeSelectorProps {
  currentMode: ModeConfig['mode']
  onSelect: (modeId: (typeof modes)[number]['id']) => void
}

export const ModeSelector = memo(function ModeSelector({
  currentMode,
  onSelect,
}: ModeSelectorProps) {
  /* Mod değişim animasyonu */
  const [animating, setAnimating] = useState(false)
  const prevModeRef = useRef(currentMode)

  useEffect(() => {
    if (prevModeRef.current !== currentMode) {
      queueMicrotask(() => setAnimating(true))
      prevModeRef.current = currentMode
      const t = setTimeout(() => setAnimating(false), 350)
      return () => clearTimeout(t)
    }
  }, [currentMode])

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {modes.map((m) => {
        const active = currentMode === m.id
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={`
              group flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium
              transition-all duration-200 hover:-translate-y-px
              ${active
                ? `border-secondary/40 bg-secondary text-secondary-foreground shadow-md shadow-secondary/25 ${animating ? 'animate-mode-switch' : ''}`
                : 'border-text-primary/10 bg-surface-800/50 text-text-muted hover:border-info/35 hover:text-text-primary'
              }
            `}
          >
            <span className={`text-base transition-transform duration-300 ${active && animating ? 'scale-125' : ''}`}>
              {m.emoji}
            </span>
            <span>{m.title}</span>
          </button>
        )
      })}
    </div>
  )
})
