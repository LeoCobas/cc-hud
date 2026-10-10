import type { CommandRunInput, RenderPropsOf } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { bar, duration, modelName } from './format'
import { parseNumstat, parseStatus } from './git'

const STATUS = '# branch.head feat/themes\n# branch.upstream origin/feat/themes\n# branch.ab +3 -0\n? x\n'

const BAND: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 9 } as RenderPropsOf['AbovePrompt']['scroll'],
  view: {},
}

test('formats model ids, bars and durations', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5 1M')
  expect(bar(50)).toBe('▰▰▰▱▱▱')
  expect(duration(95 * 60_000)).toBe('1h35m')
})

test('sums numstat, skipping binaries', () => {
  expect(parseNumstat('10\t2\ta.ts\n-\t-\tlogo.png\n5\t0\tb.ts\n')).toEqual({ added: 15, removed: 2 })
})

test('draws both lines with the git buttons', { options: { position: 'above' } }, async ($, on) => {
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', async () => ({ value: 'C:\\Users\\Leo\\aurora-app' }))
  on('session.usage', async () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, tokens: 84000, percent: 42 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 23 }, { kind: 'seven_day', percentUsed: 61 }],
    },
  }))
  on('settings.read', async () => ({ value: { effortLevel: 'high' } }))
  on('process.run', async ($, e) => {
    const cmd = e.argv.slice(1).join(' ')
    const stdout = cmd.startsWith('status') ? STATUS : cmd.startsWith('diff --numstat') ? '170\t22\ta.ts\n' : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.run', async () => ({ text: '' }))
  await $.command.run({ command: 'model', args: '' } as CommandRunInput)
  await $.command.run({ command: 'sync', args: '' } as CommandRunInput)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'slim-hud', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /aurora-app/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /feat\/themes\*/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /42%/ })).toBeDefined()
    expect(await ui.find({ key: 'push' })).toBeDefined()
    await ui.unmount()
  }
})

test('draws below the prompt by default, over the hint line', async ($, on) => {
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', async () => ({ value: 'C:/Users/Leo/aurora-app' }))
  on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 84000, percent: 42 }, rateLimits: [] } }))
  on('settings.read', async () => ({ value: {} }))
  on('process.run', async ($, e) => {
    const cmd = e.argv.slice(1).join(' ')
    const stdout = cmd.startsWith('status') ? STATUS : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.run', async () => ({ text: '' }))
  on('ui.render', { component: 'PromptHint' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  await $.command.run({ command: 'model', args: '' } as CommandRunInput)
  await $.command.run({ command: 'sync', args: '' } as CommandRunInput)

  const ui = await $.ui.mount({ plugin: 'slim-hud', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } })
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
  expect(await ui.find({ key: 'push' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /shortcuts/ })).toBeDefined()
  await ui.unmount()
})

test('fills itself when drawn before session.start, reading the per-model effort', async ($, on) => {
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', async () => ({ value: 'C:/Users/Leo/aurora-app' }))
  on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200000, tokens: 84000, percent: 42 }, rateLimits: [] } }))
  on('settings.read', async () => ({ value: { modelSettings: { 'claude-opus-5-5': { effortLevel: 'medium' } } } }))
  on('process.run', async ($, e) => {
    const stdout = e.argv[1] === 'status' ? STATUS : ''
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.render', { component: 'PromptHint' }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })

  const ui = await $.ui.mount({ plugin: 'slim-hud', surface: 'terminal', component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } })
  expect(await ui.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /medium/ })).toBeDefined()
  expect(await ui.find({ key: 'push' })).toBeDefined()
  await ui.unmount()
})
