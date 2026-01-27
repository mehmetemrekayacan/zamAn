/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: 'var(--surface-900, #0b1220)',
          800: 'var(--surface-800, #0f172a)',
          700: 'var(--surface-700, #111827)',
          600: 'var(--surface-600, #1e293b)',
        },
        text: {
          primary: 'var(--text-primary, #e5e7eb)',
          muted: 'var(--text-muted, #94a3b8)',
        },
        accent: {
          blue: 'var(--accent-blue, #38bdf8)',
          cyan: 'var(--accent-cyan, #22d3ee)',
          amber: 'var(--accent-amber, #f59e0b)',
          red: 'var(--accent-red, #ff4d6d)',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
}

