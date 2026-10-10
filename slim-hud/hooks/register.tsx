// A slim two-line HUD below the prompt, in hoobnn's `nerd` theme:
//   line 1  model · effort  folder  branch ↑↓ [+a -r]
//   line 2  context · 5h / 7d usage (· cost · time)   [Pull] [Commit] [Push]

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { GitStatus, Info, Window } from '../types'
import { cleanMessage, commitPrompt, errorLine, parseNumstat, parseStatus, resolvePrompt, suspiciousFiles } from './git'
import { C, G, bar, basename, duration, effortGlyph, levelColor, modelName, pct } from './format'

const gitState = atom({ plugin: 'slim-hud', key: 'git' } as const, null)
const draft = atom({ plugin: 'slim-hud', key: 'draft' } as const, null)
const busy = atom({ plugin: 'slim-hud', key: 'busy' } as const, null)
const info = atom({ plugin: 'slim-hud', key: 'info' } as const, null)
const stepEffort = atom({ plugin: 'slim-hud', key: 'stepEffort' } as const, null)
const tick = atom({ plugin: 'slim-hud', key: 'tick' } as const, 0)

const FETCH_EVERY_MS = 2 * 60 * 1000
const TICK_EVERY_MS = 30 * 1000
// Never let git wait on a credential prompt nobody can see.
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0' }

type $ = EngineInterface

// ---------------------------------------------------------------- session info

function windowOf(limits: SessionRateLimit[], kind: string): Window | null {
  const w = limits.find(l => l.kind === kind)
  return w ? { percent: w.percentUsed, resetsAt: w.resetsAt ?? null } : null
}

async function refreshInfo($: $): Promise<void> {
  const [model, cwd, usage, settings, effort] = await Promise.all([
    $.session.model(),
    $.session.cwd(),
    $.session.usage(),
    $.settings.read().catch(() => ({}) as Record<string, unknown>),
    read($, stepEffort),
  ])
  // The effort is set per model (`modelSettings[<id>].effortLevel`) or, in older settings, at the top level.
  const s = settings as { effortLevel?: unknown; modelSettings?: Record<string, { effortLevel?: unknown } | undefined> }
  const configured = s.modelSettings?.[model.replace(/\[1m\]$/i, '')]?.effortLevel ?? s.effortLevel
  const next: Info = {
    model: modelName(model),
    effort: effort ?? (typeof configured === 'string' ? configured : null),
    folder: basename(cwd),
    contextPercent: usage.context.percent ?? null,
    fiveHour: windowOf(usage.rateLimits, 'five_hour'),
    sevenDay: windowOf(usage.rateLimits, 'seven_day'),
    costUsd: usage.cost?.usd ?? null,
    startedAt: usage.startedAt,
  }
  await update($, info, () => next)
}

// One lazy fetch at a time, for a bar asked to draw before it has anything to show.
let isFetching = false

/** Fills the bar when it draws with nothing yet: a reload, or a session that began without `session.start`. */
async function fetchMissing($: $): Promise<void> {
  if (isFetching) return
  isFetching = true
  try {
    await Promise.all([refreshInfo($).catch(() => undefined), refreshGit($).catch(() => undefined)])
  } finally {
    isFetching = false
  }
}

// ---------------------------------------------------------------- git

async function git($: $, args: string[], init: { stdin?: string; timeoutMs?: number } = {}) {
  return $.process.run(['git', ...args], { env: GIT_ENV, timeoutMs: 60_000, ...init })
}

async function refreshGit($: $): Promise<GitStatus | null> {
  const [r, diff] = await Promise.all([
    git($, ['status', '--porcelain=v2', '--branch']),
    git($, ['diff', '--numstat', 'HEAD']).catch(() => null),
  ])
  const next = r.exitCode === 0 ? { ...parseStatus(r.stdout), ...parseNumstat(diff?.exitCode === 0 ? diff.stdout : '') } : null
  await update($, gitState, () => next)
  return next
}

/** Runs one action with the buttons hidden; a second press while busy is ignored. */
async function guarded($: $, label: string, work: () => Promise<void>) {
  if ((await read($, busy)) !== null) return
  await update($, busy, () => label)
  try {
    await work()
  } catch (err) {
    $.ui.toast(`git: ${err instanceof Error ? err.message : String(err)}`, { timeoutMs: 8000 })
  } finally {
    await update($, busy, () => null)
    await refreshGit($)
  }
}

/** fetch, then fast-forward when behind and clean; only warns when there are local changes. */
async function sync($: $): Promise<string> {
  const fetched = await git($, ['fetch', '--quiet'])
  if (fetched.exitCode !== 0) return `fetch falló: ${errorLine(fetched.stderr, fetched.stdout)}`

  const s = await refreshGit($)
  if (s === null || !s.hasUpstream || s.behind === 0) return 'Al día con el remoto.'
  if (s.changes > 0) return `⚠ ${s.behind} commit(s) nuevos en el remoto y tenés cambios locales: tocá Pull.`

  const pulled = await git($, ['pull', '--ff-only', '--quiet'])
  await refreshGit($)
  return pulled.exitCode === 0
    ? `Sincronizado: ↓${s.behind} commit(s).`
    : `pull falló: ${errorLine(pulled.stderr, pulled.stdout)}`
}

async function reportPullFailure($: $, what: string, r: { stderr: string; stdout: string }) {
  const s = await refreshGit($)
  if (s !== null && s.conflicts.length > 0) {
    $.ui.toast(`${what}: conflicto en ${s.conflicts.length} archivo(s). Usá "Resolver" o "Abortar".`, { timeoutMs: 10000 })
  } else {
    $.ui.toast(`${what} falló: ${errorLine(r.stderr, r.stdout)}`, { timeoutMs: 8000 })
  }
}

async function pull($: $) {
  const r = await git($, ['pull', '--rebase', '--autostash'])
  if (r.exitCode === 0) $.ui.toast('Pull OK.')
  else await reportPullFailure($, 'Pull', r)
}

async function abortRebase($: $) {
  const r = await git($, ['rebase', '--abort'])
  const ok = r.exitCode === 0 || (await git($, ['merge', '--abort'])).exitCode === 0
  $.ui.toast(ok ? 'Rebase abortado: quedaste como antes del pull.' : `No se pudo abortar: ${errorLine(r.stderr, r.stdout)}`, { timeoutMs: 8000 })
}

async function resolveWithClaude($: $) {
  const s = await refreshGit($)
  if (s === null || s.conflicts.length === 0) return
  await $.prompt.submit({ text: resolvePrompt(s.conflicts) })
}

async function excludeNewFiles($: $) {
  const d = await read($, draft)
  if (d === null || d.newFiles.length === 0) return
  await git($, ['reset', '-q', '--', ...d.newFiles])
  await update($, draft, () => ({ ...d, newFiles: [] }))
  $.ui.toast(`Excluidos ${d.newFiles.length} archivo(s) nuevo(s). Tocá Regenerar si el mensaje los menciona.`, { timeoutMs: 6000 })
}

/** Stages everything (first Commit press) or keeps the current staging (Regenerar), then asks Haiku. */
async function generate($: $, addAll: boolean) {
  let newFiles = (await read($, draft))?.newFiles ?? []
  if (addAll) {
    const untracked = await git($, ['ls-files', '--others', '--exclude-standard'])
    newFiles = untracked.stdout.split('\n').map(l => l.trim()).filter(Boolean)
    await git($, ['add', '-A'])
  }
  const diff = await git($, ['diff', '--staged'])
  if (diff.stdout.trim() === '') {
    $.ui.toast('No hay cambios para commitear.')
    return
  }
  const [log, stat] = await Promise.all([git($, ['log', '--format=%s', '-10']), git($, ['diff', '--staged', '--stat'])])
  const r = await $.model.complete({
    model: 'haiku',
    effort: 'low',
    maxTokens: 400,
    timeoutMs: 30_000,
    prompt: commitPrompt(log.stdout, stat.stdout, diff.stdout),
  })
  if (!r.isAnswered) {
    $.ui.toast(`No se pudo generar el mensaje (${r.reason}).`, { timeoutMs: 6000 })
    return
  }
  await update($, draft, () => ({ message: cleanMessage(r.text), newFiles }))
}

async function commit($: $) {
  const message = (await read($, draft))?.message
  if (message === undefined) return
  const r = await git($, ['commit', '-F', '-'], { stdin: message })
  if (r.exitCode === 0) {
    await update($, draft, () => null)
    $.ui.toast(`Commit: ${message.split('\n')[0]}`, { timeoutMs: 6000 })
  } else {
    $.ui.toast(`Commit falló: ${errorLine(r.stderr, r.stdout)}`, { timeoutMs: 8000 })
  }
}

async function push($: $) {
  const s = await refreshGit($)
  if (s === null) return
  if (s.hasUpstream) {
    await git($, ['fetch', '--quiet'])
    const fresh = await refreshGit($)
    if (fresh !== null && fresh.behind > 0) {
      const rebased = await git($, ['pull', '--rebase', '--autostash'])
      if (rebased.exitCode !== 0) {
        await reportPullFailure($, 'Push cancelado, el rebase', rebased)
        return
      }
    }
  }
  const r = await git($, s.hasUpstream ? ['push'] : ['push', '-u', 'origin', 'HEAD'], { timeoutMs: 120_000 })
  $.ui.toast(r.exitCode === 0 ? 'Push OK.' : `Push falló: ${errorLine(r.stderr, r.stdout)}`, { timeoutMs: 8000 })
}

function listFiles(files: readonly string[], max = 4): string {
  return files.slice(0, max).join(', ') + (files.length > max ? ` (+${files.length - max})` : '')
}

type Show = { effort: boolean; diff: boolean; weekly: boolean; resets: boolean; cost: boolean; duration: boolean; autoSync: boolean }

/** The bar: two lines, plus a commit draft or a conflict while one waits. */
async function drawBar($: $, e: Parameters<$['ui']['resolve']>[0], width: number, show: Show) {
  const i = await read($, info)
  if (i === null) {
    // The write that lands redraws the bar.
    void fetchMissing($).catch(() => undefined)
    return null
  }

  const { Box, Button, Text } = $.ui.resolve(e)
  const s = await read($, gitState)
  const working = await read($, busy)
  const d = await read($, draft)
  await read($, tick) // redraw on the clock, so the countdowns move
  const now = Date.now()

  const sep = <Text color={C.sep}> {G.sep} </Text>
  const untilReset = (w: Window) => (show.resets && w.resetsAt ? ` ${duration(Date.parse(w.resetsAt) - now)}` : '')

  // line 1: model · effort  folder  git
  const line1 = (
    <Text wrap="truncate-end">
      <Text color={C.model}>{G.model} {i.model}</Text>
      {show.effort && i.effort !== null && <Text color={C.model}> {effortGlyph(i.effort)} {i.effort}</Text>}
      {sep}
      <Text color={C.folder}>{G.folder} {i.folder}</Text>
      {s !== null && (
        <Text>
          {sep}
          <Text color={C.git}>{G.branch} </Text>
          <Text color={C.branch}>{s.branch}{s.changes > 0 ? '*' : ''}</Text>
          {s.ahead > 0 && <Text color={C.branch}> ↑{s.ahead}</Text>}
          {s.behind > 0 && <Text color={C.warning}> ↓{s.behind}</Text>}
          {!s.hasUpstream && <Text color={C.dim}> (sin upstream)</Text>}
          {show.diff && (s.added > 0 || s.removed > 0) && (
            <Text color={C.dim}>
              {' ['}
              <Text color={C.added}>+{s.added}</Text> <Text color={C.removed}>-{s.removed}</Text>
              {']'}
            </Text>
          )}
        </Text>
      )}
    </Text>
  )

  // line 2: context · usage · extras
  const gauges = (
    <Text wrap="truncate-end">
      {i.contextPercent !== null ? (
        <Text color={levelColor(i.contextPercent, C.context)}>
          {G.context} {bar(i.contextPercent)} {pct(i.contextPercent)}
        </Text>
      ) : (
        <Text color={C.dim}>{G.context} –</Text>
      )}
      {i.fiveHour !== null && (
        <Text>
          {sep}
          <Text color={levelColor(i.fiveHour.percent, C.usage)}>{G.usage} 5h {pct(i.fiveHour.percent)}</Text>
          <Text color={C.dim}>{untilReset(i.fiveHour)}</Text>
        </Text>
      )}
      {show.weekly && i.sevenDay !== null && (
        <Text>
          {sep}
          <Text color={levelColor(i.sevenDay.percent, C.usage)}>{G.weekly} 7d {pct(i.sevenDay.percent)}</Text>
          <Text color={C.dim}>{untilReset(i.sevenDay)}</Text>
        </Text>
      )}
      {show.duration && (
        <Text>
          {sep}
          <Text color={C.dim}>{G.clock} {duration(now - i.startedAt)}</Text>
        </Text>
      )}
      {show.cost && i.costUsd !== null && (
        <Text>
          {sep}
          <Text color={C.dim}>{G.cost} {i.costUsd.toFixed(2)}</Text>
        </Text>
      )}
    </Text>
  )

  const busyText = <Text color={C.dim}>{working}…</Text>
  let actions = null
  let extra = null
  if (s !== null) {
    if (working !== null) {
      actions = busyText
    } else if (s.conflicts.length > 0) {
      actions = (
        <Box gap={1}>
          <Button key="resolve" label="Resolver" variant="primary" onPress={() => guarded($, 'Enviando a Claude', () => resolveWithClaude($))} />
          <Button key="abort" label="Abortar" onPress={() => guarded($, 'Abortando', () => abortRebase($))} />
        </Box>
      )
      extra = <Text color={C.critical}>{G.warning} Conflicto en {s.conflicts.length} archivo(s): {listFiles(s.conflicts)}</Text>
    } else if (d !== null) {
      actions = (
        <Box gap={1}>
          <Button key="confirm" label="Confirmar" variant="primary" onPress={() => guarded($, 'Commiteando', () => commit($))} />
          <Button key="regen" label="Regenerar" onPress={() => guarded($, 'Generando mensaje', () => generate($, false))} />
          {d.newFiles.length > 0 && <Button key="exclude" label="Excluir nuevos" onPress={() => guarded($, 'Excluyendo', () => excludeNewFiles($))} />}
          <Button key="cancel" label="Cancelar" onPress={() => update($, draft, () => null)} />
        </Box>
      )
    } else {
      actions = (
        <Box gap={1}>
          <Button key="pull" label="Pull" onPress={() => guarded($, 'Pull', () => pull($))} />
          <Button key="commit" label="Commit" onPress={() => guarded($, 'Generando mensaje', () => generate($, true))} />
          <Button key="push" label="Push" onPress={() => guarded($, 'Push', () => push($))} />
        </Box>
      )
    }
  }

  // A commit draft opens below the bar while it waits for an answer.
  let draftView = null
  if (d !== null && working === null) {
    const risky = suspiciousFiles(d.newFiles)
    draftView = (
      <Box flexDirection="column">
        <Text color={C.branch}>Commit propuesto:</Text>
        <Text>{d.message}</Text>
        {d.newFiles.length > 0 && (
          <Text color={risky.length > 0 ? C.warning : C.dim}>
            {risky.length > 0 ? `${G.warning} Revisá: ${listFiles(risky)} · ` : ''}Nuevos: {listFiles(d.newFiles)}
          </Text>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width={width}>
      {line1}
      <Box justifyContent="space-between" gap={1}>
        <Box flexGrow={1} flexShrink={1}>{gauges}</Box>
        {actions}
      </Box>
      {extra}
      {draftView}
    </Box>
  )
}

// ---------------------------------------------------------------- register

export const register: Register = (on, options) => {
  const opt = (key: string, fallback: boolean) => (typeof options[key] === 'boolean' ? (options[key] as boolean) : fallback)
  const show = {
    effort: opt('showEffort', true),
    diff: opt('showDiff', true),
    weekly: opt('showWeekly', true),
    resets: opt('showResets', true),
    cost: opt('showCost', false),
    duration: opt('showDuration', false),
    autoSync: opt('autoSync', true),
  }
  const below = options.position !== 'above'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sync', description: 'git fetch y pull si estás atrás (slim-hud)' }).catch(() => undefined)
    const started = await next(e)

    void refreshInfo($).catch(() => undefined)
    $.clock.every(TICK_EVERY_MS, () => {
      void update($, tick, n => n + 1)
    })

    const inRepo = await git($, ['rev-parse', '--is-inside-work-tree']).catch(() => null)
    if (inRepo?.exitCode === 0) {
      void refreshGit($).catch(() => undefined)
      if (show.autoSync) {
        void sync($).then(text => $.ui.toast(text, { timeoutMs: 6000 }))
        $.clock.every(FETCH_EVERY_MS, () => {
          void git($, ['fetch', '--quiet']).then(() => refreshGit($))
        })
      }
    }

    return started
  })

  on('command.run', { command: 'sync' }, async $ => ({ text: await sync($).catch(err => `sync falló: ${String(err)}`) }))

  // /model and /effort change what line 1 shows before the next turn does.
  on('command.run', async ($, e, next) => {
    const result = await next(e)
    if (e.command === 'model' || e.command === 'effort') {
      if (e.command === 'effort') await update($, stepEffort, () => null).catch(() => undefined)
      await refreshInfo($).catch(() => undefined)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    void refreshInfo($).catch(() => undefined)
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined && e.effort !== undefined) {
      await update($, stepEffort, () => String(e.effort))
      void refreshInfo($).catch(() => undefined)
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    void refreshGit($).catch(() => undefined)
    void refreshInfo($).catch(() => undefined)
    return next(e)
  })

  if (below) {
    // Under the prompt: the bar, then the engine's own hint line.
    on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
      const width = (e.viewport?.columns ?? 120) - 2
      const tree = await drawBar($, e, width, show)
      if (tree === null) return next(e)
      const { Box } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          {tree}
          {await next(e)}
        </Box>
      )
    })
  } else {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      if (e.props.hasSurvey) return next(e)
      return (await drawBar($, e, e.props.bodyColumns, show)) ?? next(e)
    })
  }
}
