import { useEffect, useState } from 'react'

const COLORS = ['#38bdf8', '#22d3ee', '#f59e0b', '#a78bfa', '#f472b6']
const PARTICLE_COUNT = 50

export function Confetti({ active, onDone }: { active: boolean; onDone?: () => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      return
    }
    setVisible(true)
    const t = setTimeout(() => {
      setVisible(false)
      onDone?.()
    }, 2600)
    return () => clearTimeout(t)
  }, [active, onDone])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[55] overflow-hidden" aria-hidden>
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <div
          key={i}
          className="absolute h-2 w-2 rounded-sm opacity-90"
          style={{
            left: `${10 + (i * 83) % 80}%`,
            top: '-10px',
            backgroundColor: COLORS[i % COLORS.length],
            animation: 'confetti-fall 2.5s ease-out forwards',
            animationDelay: `${(i * 30) % 500}ms`,
            transform: `rotate(${(i * 37) % 360}deg)`,
          }}
        />
      ))}
    </div>
  )
}
