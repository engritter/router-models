import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLUGIN = 'router-models'

const band = (bodyColumns = 140, isWorking = false) =>
  ({
    plugin: PLUGIN,
    component: 'AbovePrompt',
    props: {
      hasSurvey: false,
      isCollapsed: false,
      isWorking,
      maxRows: 12,
      bodyColumns,
      scroll: { offset: 0, bodyRows: 12 },
      view: {},
    },
  }) as const

const ALL = ['model', 'effort', 'clear', 'compact', 'goal']

type World = {
  model: string
  commands: string[]
  runs: { command: string; args: string }[]
  fills: { text: string; cursor?: number }[]
  draft: string
  context: { tokens?: number; window: number; percent?: number }
  commandFails?: string
  /** O aplicativo aceita /model mas continua reportando o modelo anterior. */
  ignoresModel?: boolean
}

/** O "aplicativo" simulado: cada hook aqui fica abaixo do plugin e responde como o motor. */
function app(on: On, w: World) {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.list', () => ({
    value: w.commands.map(name => ({ name, description: '', source: 'builtin' as const })),
  }))
  on('config.list', () => ({ value: [] }))
  on('session.model', () => ({ value: w.model }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: w.context, rateLimits: [] },
  }))
  on('command.run', (_, e) => {
    if (w.commandFails === e.command) throw new Error('comando recusado')
    w.runs.push({ command: e.command, args: e.args })
    if (e.command === 'model' && !w.ignoresModel) w.model = e.args
    return { text: '' }
  })
  on('prompt.read', () => ({ value: { text: w.draft, cursor: w.draft.length } }))
  on('prompt.fill', (_, e) => {
    w.fills.push({ text: e.text, cursor: e.cursor })
    w.draft = e.text
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
}

function world(over: Partial<World> = {}): World {
  return {
    model: 'claude-opus-5-5',
    commands: ALL,
    runs: [],
    fills: [],
    draft: '',
    context: { window: 200_000 },
    ...over,
  }
}

const start = { cwd: '/', surface: 'desktop', isInteractive: true } as const

async function step(
  $: Engine,
  model: string,
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max',
) {
  const s = $.turn.step({ turnId: 't1', index: 0, model, effort, messageCount: 1 })
  for await (const _ of s) {
    // consome o fluxo
  }
}

test('sem dados de contexto mostra "indisponível", nunca 0%, em todas as superfícies', async ($, on) => {
  app(on, world())
  await $.session.start(start)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...band(), surface })
    expect(await ui.find({ type: 'Text', text: /^Router de Modelos$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /indisponível · limite 200k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /aguardando a 1ª resposta/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^0%/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('mostra percentual e usados/limite quando o aplicativo informa', async ($, on) => {
  app(on, world({ context: { tokens: 84_000, window: 200_000, percent: 42 } }))
  await $.session.start(start)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(), surface })
    expect(await ui.find({ type: 'Text', text: /42% · 84k\/200k/ })).toBeDefined()
    await ui.unmount()
  }
})

test('troca de modelo roda /model e só confirma quando o aplicativo reporta o novo modelo', async ($, on) => {
  const w = world()
  app(on, w)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
  await ui.press({ key: 'model-claude-sonnet-5-5' })
  expect(w.runs).toEqual([{ command: 'model', args: 'claude-sonnet-5-5' }])
  expect(await ui.find({ type: 'Text', text: /Modelo: Sonnet 5\.5 confirmado/ })).toBeDefined()
  await ui.unmount()
})

test('modelo aceito mas não refletido fica pendente e falha se o aplicativo reportar outro', async ($, on) => {
  // O aplicativo aceita o comando, mas continua reportando Opus.
  app(on, world({ ignoresModel: true }))
  await $.session.start(start)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await ui.press({ key: 'model-claude-haiku-5-5' })
  expect(await ui.find({ type: 'Text', text: /Haiku 5\.5 solicitado, aguardando confirmação/ })).toBeDefined()
  await step($, 'claude-opus-5-5', 'high')
  expect(await ui.find({ type: 'Text', text: /falha ao aplicar Haiku 5\.5 \(o aplicativo reportou claude-opus-5-5\)/ })).toBeDefined()
  await ui.unmount()
})

test('falha do comando /model aparece como erro', async ($, on) => {
  app(on, world({ commandFails: 'model' }))
  await $.session.start(start)
  const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
  await ui.press({ key: 'model-claude-haiku-5-5' })
  expect(await ui.find({ type: 'Text', text: /Não foi possível trocar o modelo/ })).toBeDefined()
  await ui.unmount()
})

test('esforço: pendente após /effort, confirmado pela próxima requisição', async ($, on) => {
  const w = world()
  app(on, w)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
  await ui.press({ key: 'effort-max' })
  expect(w.runs).toEqual([{ command: 'effort', args: 'max' }])
  expect(await ui.find({ type: 'Text', text: /Esforço: Máximo solicitado, aguardando confirmação/ })).toBeDefined()
  await step($, 'claude-opus-5-5', 'max')
  expect(await ui.find({ type: 'Text', text: /Esforço: Máximo confirmado/ })).toBeDefined()
  await ui.unmount()
})

test('esforço ajustado pelo aplicativo mostra o valor efetivo', async ($, on) => {
  app(on, world())
  await $.session.start(start)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await ui.press({ key: 'effort-max' })
  await step($, 'claude-opus-5-5', 'high')
  expect(await ui.find({ type: 'Text', text: /falha ao aplicar Máximo \(efetivo: Alto/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Alto$/ })).toBeDefined()
  await ui.unmount()
})

test('contadores de tokens somam entrada (com cache) e saída do loop principal e zeram no /clear', async ($, on) => {
  app(on, world())
  await $.session.start(start)
  const usage = {
    input_tokens: 1000,
    cache_read_input_tokens: 10_000,
    cache_creation_input_tokens: 1300,
    output_tokens: 1500,
    model: 'claude-opus-5-5',
  }
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage })
  // Turno de subagente não conta.
  await $.turn.complete({
    answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer', usage, agentId: 'a1',
  })
  const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Tokens ↓ 12,3k entrada · ↑ 1,5k saída/ })).toBeDefined()
  await ui.unmount()
  await $.session.end({ reason: 'clear', sessionId: 's1' } as never)
  const after = await $.ui.mount({ ...band(), surface: 'desktop' })
  expect(await after.find({ type: 'Text', text: /aguardando a 1ª resposta/ })).toBeDefined()
  await after.unmount()
})

test('Limpar exige confirmação; Cancelar não roda nada', async ($, on) => {
  const w = world()
  app(on, w)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
  await ui.press({ key: 'clear' })
  expect(w.runs).toEqual([])
  expect(await ui.find({ type: 'Text', text: /Limpar a conversa atual\?/ })).toBeDefined()
  await ui.press({ key: 'clear-cancel' })
  expect(w.runs).toEqual([])
  await ui.press({ key: 'clear' })
  await ui.press({ key: 'clear-confirm' })
  expect(w.runs).toEqual([{ command: 'clear', args: '' }])
  await ui.unmount()
})

test('Meta preserva o texto já digitado', async ($, on) => {
  const w = world({ draft: 'revisar a norma NR-12' })
  app(on, w)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...band(), surface: 'terminal' })
  await ui.press({ key: 'goal' })
  expect(w.fills).toEqual([{ text: '/goal revisar a norma NR-12', cursor: '/goal revisar a norma NR-12'.length }])
  expect(w.runs).toEqual([])
  await ui.unmount()
})

test('Compactar usa /compact do aplicativo', async ($, on) => {
  const w = world()
  app(on, w)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
  await ui.press({ key: 'compact' })
  expect(w.runs).toEqual([{ command: 'compact', args: '' }])
  await ui.unmount()
})

test('sem /model, /effort, /clear e /goal os controles avisam indisponível e nada é enviado', async ($, on) => {
  const w = world({ commands: ['compact'] })
  app(on, w)
  await $.session.start(start)
  const ui = await $.ui.mount({ ...band(), surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /\/model indisponível/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\/effort indisponível/ })).toBeDefined()
  expect(await ui.find({ key: 'clear' })).toBeUndefined()
  expect(await ui.find({ key: 'goal' })).toBeUndefined()
  expect(w.runs).toEqual([])
  await ui.unmount()
})

test('em largura estreita os rótulos de esforço encurtam', async ($, on) => {
  app(on, world())
  await $.session.start(start)
  const ui = await $.ui.mount({ ...band(60), surface: 'terminal' })
  expect((await ui.find({ key: 'effort-max' }))?.text).toBe('Máx')
  await ui.unmount()
})
