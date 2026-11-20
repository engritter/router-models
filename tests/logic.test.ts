import { expect, test } from 'claude-code/testing'

import {
  capsFrom,
  contextTone,
  formatTokens,
  groupContext,
  judgeEffort,
  judgeModel,
  matchesModel,
  modelLabel,
  modelOptions,
  modelShort,
  sortModels,
  textBar,
  trackIndex,
} from '../hooks/logic'

test('formatTokens usa k/M em pt-BR e "—" para ausente', async () => {
  expect(formatTokens(950)).toBe('950')
  expect(formatTokens(12_345)).toBe('12,3k')
  expect(formatTokens(215_000)).toBe('215k')
  expect(formatTokens(1_000_000)).toBe('1M')
  expect(formatTokens(1_250_000)).toBe('1,3M')
  expect(formatTokens(undefined)).toBe('—')
  expect(formatTokens(null)).toBe('—')
})

test('matchesModel reconhece id, alias, data e nome de exibição, sem confundir famílias', async () => {
  expect(matchesModel('claude-opus-5-5', 'Opus 5.5')).toBe(true)
  expect(matchesModel('claude-opus-5-5', 'claude-opus-5-5-20261001')).toBe(true)
  expect(matchesModel('opus', 'claude-opus-5-5')).toBe(true)
  expect(matchesModel('claude-opus-5-5', 'claude-opus-5-5[1m]')).toBe(true)
  expect(matchesModel('claude-opus-5-5', 'claude-sonnet-5-5')).toBe(false)
  expect(matchesModel('sonnet', 'Opus 5.5')).toBe(false)
  expect(matchesModel('claude-opus-5-5', null)).toBe(false)
})

test('modelLabel produz rótulos curtos', async () => {
  expect(modelLabel('claude-haiku-5-5')).toBe('Haiku 5.5')
  expect(modelLabel('claude-fable-5-2')).toBe('Fable 5.2')
  expect(modelLabel('sonnet')).toBe('Sonnet')
  expect(modelLabel('default')).toBe('Padrão')
  expect(modelLabel('modelo-x')).toBe('modelo-x')
})

test('modelOptions: opção do usuário, depois /config, depois reserva', async () => {
  const rows = [
    {
      key: 'model',
      label: 'Model',
      kind: 'choice',
      value: 'opus',
      options: ['opus', 'sonnet'],
      provider: { plugin: 'engine', tier: 'core' },
      isLocked: false,
    },
  ] as never
  expect(modelOptions(rows, 'haiku, opus').models.map(m => m.id)).toEqual(['haiku', 'opus'])
  expect(modelOptions(rows, '').models.map(m => m.label)).toEqual(['Opus', 'Sonnet'])
  const fromConfig = modelOptions(rows, '')
  expect(fromConfig.source).toBe('config')
  expect(fromConfig.models.map(m => m.id)).toEqual(['opus', 'sonnet'])
  const fallback = modelOptions(null, '')
  expect(fallback.source).toBe('fallback')
  expect(fallback.models.length).toBe(4)
})

test('capsFrom só habilita comandos que o aplicativo listou', async () => {
  const c = capsFrom([{ name: 'model', description: '', source: 'builtin' }], null, '')
  expect(c.hasModel).toBe(true)
  expect(c.hasEffort).toBe(false)
  expect(c.hasClear).toBe(false)
  expect(c.hasGoal).toBe(false)
})

test('contextTone e textBar', async () => {
  expect(contextTone(undefined)).toBe('inactive')
  expect(contextTone(10)).toBe('success')
  expect(contextTone(70)).toBe('warning')
  expect(contextTone(90)).toBe('error')
  expect(textBar(50, 4)).toBe('▰▰▱▱')
  expect(textBar(undefined, 3)).toBe('▱▱▱')
})

test('judgeEffort distingue confirmado, ajustado e sem suporte', async () => {
  const req = { target: 'max', status: 'pending' } as const
  expect(judgeEffort(req, 'max')?.status).toBe('confirmed')
  const adjusted = judgeEffort(req, 'high')
  expect(adjusted?.status).toBe('failed')
  expect(adjusted?.detail).toMatch(/High/)
  expect(judgeEffort(req, undefined)?.status).toBe('failed')
  // Só pedidos pendentes são julgados.
  const sending = { target: 'max', status: 'sending' } as const
  expect(judgeEffort(sending, 'low')).toBe(sending)
  expect(judgeEffort(null, 'low')).toBe(null)
})

test('judgeModel confirma ou reprova pelo modelo reportado', async () => {
  const req = { target: 'claude-sonnet-5-5', status: 'pending' } as const
  expect(judgeModel(req, 'claude-sonnet-5-5')?.status).toBe('confirmed')
  expect(judgeModel(req, 'claude-opus-5-5')?.status).toBe('failed')
  expect(judgeModel(req, undefined)).toBe(req)
})

test('modelShort e sortModels: nomes curtos, do mais forte ao mais leve', async () => {
  expect(modelShort('claude-opus-5-5')).toBe('Opus')
  expect(modelShort('x-1')).toBe('x-1')
  const ids = sortModels([{ id: 'haiku' }, { id: 'x' }, { id: 'fable' }, { id: 'sonnet' }]).map(m => m.id)
  expect(ids).toEqual(['fable', 'sonnet', 'haiku', 'x'])
})

test('groupContext separa instruções, ferramentas, conversa e reserva', async () => {
  const parts = groupContext([
    { name: 'System prompt', tokens: 3000, kind: 'used' },
    { name: 'System tools', tokens: 12000, kind: 'used' },
    { name: 'MCP tools', tokens: 2000, kind: 'used' },
    { name: 'Memory files', tokens: 1000, kind: 'used' },
    { name: 'Messages', tokens: 50000, kind: 'used' },
    { name: 'Free space', tokens: 80000, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 33000, kind: 'buffer' },
    { name: 'MCP tools (deferred)', tokens: 9000, kind: 'deferred' },
  ])
  expect(parts).toEqual({ instructions: 4000, tools: 14000, conversation: 50000, reserve: 33000 })
})

test('trackIndex mapeia a posição do ponteiro para o nível', async () => {
  expect(trackIndex(0, 15)).toBe(0)
  expect(trackIndex(4, 15)).toBe(1)
  expect(trackIndex(7.5, 15)).toBe(2)
  expect(trackIndex(14.9, 15)).toBe(4)
  expect(trackIndex(99, 15)).toBe(4)
  expect(trackIndex(-3, 15)).toBe(0)
  expect(trackIndex(5, 0)).toBe(0)
})
