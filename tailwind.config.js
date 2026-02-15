/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: 'var(--surface-900, #0a0f1a)',
          800: 'var(--surface-800, #0f1629)',
          700: 'var(--surface-700, #151d32)',
          600: 'var(--surface-600, #1c2744)',
          500: 'var(--surface-500, #243352)',
        },
        text: {
          primary: 'var(--text-primary, #eef0f4)',
          secondary: 'var(--text-secondary, #c1c8d8)',
          muted: 'var(--text-muted, #7b879e)',
        },
        accent: {
          blue: 'var(--accent-blue, #3b82f6)',
          cyan: 'var(--accent-cyan, #06b6d4)',
          amber: 'var(--accent-amber, #f59e0b)',
          red: 'var(--accent-red, #ef4444)',
          green: 'var(--accent-green, #10b981)',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', '"Fira Code"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '16px',
        'card-sm': '12px',
      },
      animation: {
        'btn-pulse': 'btn-state-pulse 0.45s cubic-bezier(0.4,0,0.2,1)',
        'list-slide': 'list-slide-in 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'toast-enter': 'toast-slide-up 0.35s cubic-bezier(0.16,1,0.3,1) forwards',
        'toast-exit': 'toast-slide-down 0.25s ease-in forwards',
        'mode-switch': 'mode-switch 0.3s cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
}

