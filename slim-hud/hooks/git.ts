import type { GitStatus } from '../types'

const MAX_DIFF_CHARS = 24000

/** Names that usually hold secrets or local junk and should not be committed blindly. */
const SUSPICIOUS = /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx|crt|log|sqlite|db)|id_rsa.*|.*secret.*|.*credential.*)$/i

/** Parses `git status --porcelain=v2 --branch`. */
export function parseStatus(out: string): GitStatus {
  const status: GitStatus = { branch: '?', hasUpstream: false, ahead: 0, behind: 0, changes: 0, conflicts: [], added: 0, removed: 0 }

  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      status.branch = line.slice('# branch.head '.length).trim()
    } else if (line.startsWith('# branch.upstream ')) {
      status.hasUpstream = true
    } else if (line.startsWith('# branch.ab ')) {
      const [, ahead, behind] = line.match(/\+(\d+) -(\d+)/) ?? []
      status.ahead = Number(ahead ?? 0)
      status.behind = Number(behind ?? 0)
    } else if (line.startsWith('u ')) {
      // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      status.conflicts.push(line.split(' ').slice(10).join(' '))
      status.changes += 1
    } else if (line.trim() !== '' && !line.startsWith('#')) {
      status.changes += 1
    }
  }

  return status
}

export function suspiciousFiles(files: readonly string[]): string[] {
  return files.filter(f => SUSPICIOUS.test(f))
}

/** What the main model gets when the person asks it to resolve a conflict. */
export function resolvePrompt(conflicts: readonly string[]): string {
  return [
    'Un `git pull --rebase` quedó con conflictos. Resolvelos:',
    '',
    ...conflicts.map(f => `- ${f}`),
    '',
    '1. Mirá `git status` y `git log --oneline -5 origin/HEAD` para entender qué trajo el remoto y qué es nuestro.',
    '2. En cada archivo, combiná los dos lados conservando la intención de ambos cambios (no descartes uno sin motivo). Si un conflicto es ambiguo, preguntame antes de elegir.',
    '3. `git add` de los archivos resueltos y `GIT_EDITOR=true git rebase --continue` hasta terminar el rebase.',
    '4. Corré el build/tests del proyecto para verificar.',
    '5. No hagas push: avisame cómo quedó y lo pusheo yo con el botón.',
  ].join('\n')
}
/** The prompt Haiku gets: recent subjects as the style guide, then the staged diff. */
export function commitPrompt(log: string, stat: string, diff: string): string {
  const cut = diff.length > MAX_DIFF_CHARS
  return [
    'Write a git commit message for the staged changes below.',
    'Match the style of the recent commits (conventional commits, e.g. "fix(scope): ...", in English).',
    'Subject line under 72 chars, imperative mood. Add a short body (1-3 lines) only if the "why" is not obvious from the subject.',
    'Reply with the commit message only: no quotes, no code fences, no preamble.',
    '',
    '<recent_commits>',
    log.trim(),
    '</recent_commits>',
    '',
    '<diffstat>',
    stat.trim(),
    '</diffstat>',
    '',
    `<diff${cut ? ' truncated="true"' : ''}>`,
    cut ? diff.slice(0, MAX_DIFF_CHARS) : diff,
    '</diff>',
  ].join('\n')
}

/** Strips fences or quotes a model may wrap the message in. */
export function cleanMessage(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/, '')
    .replace(/^"(.*)"$/s, '$1')
    .trim()
}

/** Sums `git diff --numstat HEAD` (binary files count as nothing). */
export function parseNumstat(out: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of out.split('\n')) {
    const [a, r] = line.split('\t')
    if (a !== undefined && /^\d+$/.test(a)) added += Number(a)
    if (r !== undefined && /^\d+$/.test(r)) removed += Number(r)
  }
  return { added, removed }
}

/** Last useful line of a git error, for a toast. */
export function errorLine(stderr: string, stdout: string): string {
  const lines = `${stderr}\n${stdout}`.split('\n').map(l => l.trim()).filter(Boolean)
  return lines.find(l => /^(error|fatal|CONFLICT)/.test(l)) ?? lines[lines.length - 1] ?? 'falló'
}
