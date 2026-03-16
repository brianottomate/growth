import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-card': 'var(--bg-card)',
        'bg-card-hover': 'var(--bg-card-hover)',
        border: 'var(--border)',
        'border-light': 'var(--border-light)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'accent-blue': 'var(--accent-blue)',
        'accent-blue-light': 'var(--accent-blue-light)',
        'accent-blue-dim': 'var(--accent-blue-dim)',
        'status-green': 'var(--status-green)',
        'status-yellow': 'var(--status-yellow)',
        'status-red': 'var(--status-red)',
        'status-blue': 'var(--status-blue)',
        'channel-meta': '#1877f2',
        'channel-google': '#34a853',
        'channel-pinterest': '#e60023',
        'channel-tiktok': '#000000',
        'channel-microsoft': '#00897b',
        'channel-criteo': '#f97316',
        'channel-mountain': '#8b5cf6',
        'channel-influencer': '#ec4899',
        'channel-lifecycle': '#10b981',
        'channel-demand': '#f59e0b',
        'channel-directmail': '#84cc16',
        'channel-affiliate': '#6366f1',
        'channel-seo': '#06b6d4',
        'channel-organic': '#a855f7',
        'channel-other': '#64748b',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        glow: 'var(--shadow-glow)',
      },
    },
  },
  plugins: [],
}

export default config
