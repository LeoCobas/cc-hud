// Nerd Font glyphs (Private Use Area) as escapes so an editor cannot drop them,
// and the Catppuccin colors of hoobnn's `nerd` HUD theme.

export const G = {
  model: '\u{f06a9}', // nf-md-robot
  folder: '', // nf-fa-folder
  branch: '', // nf-dev-git_branch
  context: '\u{f035b}', // nf-md-memory
  usage: '', // nf-fa-bolt
  weekly: '', // nf-fa-calendar
  clock: '', // nf-fa-clock_o
  cost: '', // nf-fa-dollar
  warning: '', // nf-fa-warning
  sep: '', // powerline thin right arrow
}

export const C = {
  model: '#89b4fa',
  folder: '#f9e2af',
  git: '#f38ba8',
  branch: '#a6e3a1',
  added: '#a6e3a1',
  removed: '#f38ba8',
  context: '#a6e3a1',
  usage: '#89dceb',
  warning: '#f9e2af',
  critical: '#f38ba8',
  dim: '#6c7086',
  sep: '#585b70',
}

const EFFORT_GLYPH: Record<string, string> = { low: '○', medium: '◔', high: '◑', xhigh: '◕', max: '●' }

export function effortGlyph(level: string): string {
  return EFFORT_GLYPH[level] ?? '◑'
}

const FAMILIES: Record<string, string> = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', fable: 'Fable' }

/** `claude-opus-5-5[1m]` → `Opus 5.5 1M`. */
export function modelName(id: string): string {
  const isLong = /\[1m\]$/i.test(id)
  const bare = id.replace(/\[1m\]$/i, '')
  const m = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(bare)
  let name = bare
  if (m) name = `${FAMILIES[m[1]!.toLowerCase()]} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
  else if (FAMILIES[bare.toLowerCase()]) name = FAMILIES[bare.toLowerCase()]!
  return isLong ? `${name} 1M` : name
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

/** Green under 70%, yellow under 90%, red past it. */
export function levelColor(percent: number, ok: string): string {
  return percent >= 90 ? C.critical : percent >= 70 ? C.warning : ok
}

/** `▰▰▰▱▱▱` for a percent. */
export function bar(percent: number, cells = 6): string {
  const filled = Math.max(0, Math.min(cells, Math.round((percent / 100) * cells)))
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}

/** 95 min → `1h35m`, 3 days → `3d4h`. */
export function duration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000))
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h${String(min % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

export function pct(n: number): string {
  return `${Math.round(n)}%`
}
