/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        foreground: 'var(--foreground)',
        background: 'var(--background)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        success: {
          DEFAULT: 'var(--success)',
          foreground: 'var(--success-foreground)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          foreground: 'var(--warning-foreground)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          foreground: 'var(--danger-foreground)',
        },
        info: {
          DEFAULT: 'var(--info)',
          foreground: 'var(--info-foreground)',
        },
        'card-foreground': 'var(--card-foreground)',
        'muted-foreground': 'var(--muted-foreground)',
        'primary-foreground': 'var(--primary-foreground)',
        'secondary-foreground': 'var(--secondary-foreground)',
        'success-foreground': 'var(--success-foreground)',
        'warning-foreground': 'var(--warning-foreground)',
        'danger-foreground': 'var(--danger-foreground)',
        'info-foreground': 'var(--info-foreground)',
        surface: {
          900: 'var(--surface-900)',
          800: 'var(--surface-800)',
          700: 'var(--surface-700)',
          600: 'var(--surface-600)',
          500: 'var(--surface-500)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          blue: 'var(--accent-blue)',
          cyan: 'var(--accent-cyan)',
          amber: 'var(--accent-amber)',
          red: 'var(--accent-red)',
          green: 'var(--accent-green)',
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

