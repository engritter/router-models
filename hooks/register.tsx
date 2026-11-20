// Router de Modelos (router-modelos): barra acima da caixa de mensagem com contexto,
// modelos, tokens, esforço e ações. Usa apenas a API de function hooks
// declarada pelo Claude Code (verificada na build 2.1.325).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { RcCaps, RcContext, RcEffort, RcNotice, RcRequest, RcTokens } from '../types'
import { contextGauge, effortSteps, effortText } from './icons'
import {
  EFFORTS,
  EFFORT_LABEL,
  EFFORT_SHORT,
  capsFrom,
  contextTone,
  effortName,
  formatTokens,
  goalDraft,
  isEffort,
  judgeEffort,
  judgeModel,
  matchesModel,
  modelLabel,
  requestText,
  textBar,
} from './logic'

const caps = atom({ plugin: 'router-modelos', key: 'caps' } as const, null)
const context = atom({ plugin: 'router-modelos', key: 'context' } as const, null)
const tokens = atom({ plugin: 'router-modelos', key: 'tokens' } as const, null)
const currentModel = atom({ plugin: 'router-modelos', key: 'currentModel' } as const, null)
const apiModel = atom({ plugin: 'router-modelos', key: 'apiModel' } as const, null)
const effectiveEffort = atom({ plugin: 'router-modelos', key: 'effectiveEffort' } as const, null)
const modelReq = atom({ plugin: 'router-modelos', key: 'modelReq' } as const, null)
const effortReq = atom({ plugin: 'router-modelos', key: 'effortReq' } as const, null)
const confirmClear = atom({ plugin: 'router-modelos', key: 'confirmClear' } as const, false)
const notice = atom({ plugin: 'router-modelos', key: 'notice' } as const, null)

type $ = EngineInterface

function mk(target: string, status: RcRequest['status'], detail?: string): RcRequest {
  return detail === undefined ? { target, status } : { target, status, detail }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function toContext(c: SessionContextUsage | undefined): RcContext | null {
  if (c === undefined) return null
  const out: RcContext = {}
  if (typeof c.tokens === 'number') out.tokens = c.tokens
  if (typeof c.window === 'number' && c.window > 0) out.window = c.window
  if (typeof c.percent === 'number') out.percent = c.percent
  return out
}

async function say($: $, n: RcNotice | null): Promise<void> {
  await update($, notice, () => n)
  if (n?.kind === 'error') $.ui.toast(n.text)
}

async function refreshContext($: $): Promise<void> {
  try {
    const usage = await $.session.usage()
    await update($, context, () => toContext(usage.context))
  } catch {
    await update($, context, () => null)
  }
}

async function refreshModel($: $): Promise<string | null> {
  try {
    const m = await $.session.model()
    await update($, currentModel, () => m)
    return m
  } catch {
    return null
  }
}

async function refreshCaps($: $, override: string): Promise<RcCaps> {
  let commands: Awaited<ReturnType<$['command']['list']>> = []
  let rows: Awaited<ReturnType<$['config']['list']>> | null = null
  try {
    commands = await $.command.list()
  } catch {
    commands = []
  }
  try {
    rows = await $.config.list()
  } catch {
    rows = null
  }
  const found = capsFrom(commands, rows, override)
  await update($, caps, () => found)
  return found
}

// ---- Ações -----------------------------------------------------------------

async function selectModel($: $, id: string): Promise<void> {
  const c = await read($, caps)
  if (!c?.hasModel) {
    await say($, { kind: 'error', text: 'Troca de modelo indisponível: o aplicativo não oferece /model nesta sessão.' })
    return
  }
  await update($, modelReq, () => mk(id, 'sending'))
  try {
    await $.command.run({ command: 'model', args: id })
  } catch (err) {
    await update($, modelReq, () => mk(id, 'failed', message(err)))
    await say($, { kind: 'error', text: `Não foi possível trocar o modelo: ${message(err)}` })
    return
  }
  const reported = await refreshModel($)
  if (matchesModel(id, reported)) {
    await update($, modelReq, () => mk(id, 'confirmed', `aplicativo reporta ${reported}`))
  } else {
    await update($, modelReq, () => mk(id, 'pending', 'aguardando a próxima requisição'))
  }
  await say($, null)
}

async function selectEffort($: $, level: RcEffort): Promise<void> {
  const c = await read($, caps)
  if (!c?.hasEffort) {
    await say($, { kind: 'error', text: 'Controle de esforço indisponível: o aplicativo não oferece /effort nesta sessão.' })
    return
  }
  await update($, effortReq, () => mk(level, 'sending'))
  try {
    await $.command.run({ command: 'effort', args: level })
  } catch (err) {
    await update($, effortReq, () => mk(level, 'failed', message(err)))
    await say($, { kind: 'error', text: `Não foi possível trocar o esforço: ${message(err)}` })
    return
  }
  // O esforço efetivo só é conhecido na próxima requisição (turn.step).
  await update($, effortReq, () => mk(level, 'pending', 'aguardando a próxima requisição'))
  await say($, null)
}

async function runCompact($: $, isWorking: boolean): Promise<void> {
  const c = await read($, caps)
  try {
    if (c?.hasCompact) {
      await $.command.run({ command: 'compact' })
    } else if (!isWorking) {
      const { skip } = await $.session.compact()
      if (skip) {
        await say($, { kind: 'info', text: 'Compactação recusada por outro plugin.' })
        return
      }
    } else {
      await say($, { kind: 'info', text: 'Aguarde o fim da resposta para compactar.' })
      return
    }
    await say($, { kind: 'info', text: 'Compactação solicitada.' })
    await refreshContext($)
  } catch (err) {
    await say($, { kind: 'error', text: `Não foi possível compactar: ${message(err)}` })
  }
}

async function runClear($: $): Promise<void> {
  await update($, confirmClear, () => false)
  try {
    await $.command.run({ command: 'clear' })
  } catch (err) {
    await say($, { kind: 'error', text: `Não foi possível limpar: ${message(err)}` })
  }
}

async function openGoal($: $): Promise<void> {
  try {
    const box = await $.prompt.read()
    const draft = goalDraft(box.text)
    await $.prompt.fill({ text: draft.text, mode: 'replace', cursor: draft.cursor })
  } catch (err) {
    await say($, { kind: 'error', text: `Não foi possível abrir /goal: ${message(err)}` })
  }
}

export const register: Register = (on, options) => {
  const override = typeof options.models === 'string' ? options.models : ''

  // ---- Eventos -------------------------------------------------------------

  on('session.start', async ($, e, next) => {
    await update($, modelReq, () => null)
    await update($, effortReq, () => null)
    await update($, confirmClear, () => false)
    await update($, notice, () => null)
    await refreshCaps($, override)
    await refreshModel($)
    await refreshContext($)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      await update($, context, () => toContext(e.context))
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      // Nova conversa: contadores recomeçam; o contexto volta a "aguardando".
      await update($, tokens, () => null)
      await update($, context, () => null)
      await update($, confirmClear, () => false)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const level = e.effort
      await update($, effectiveEffort, () => (level === undefined ? null : String(level)))
      await update($, effortReq, req => judgeEffort(req, level))
      await update($, modelReq, req => judgeModel(req, e.model))
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const u = e.usage
      if (u !== undefined) {
        const input = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
        await update($, tokens, prev => ({
          input: (prev?.input ?? 0) + input,
          output: (prev?.output ?? 0) + u.output_tokens,
          turns: (prev?.turns ?? 0) + 1,
        }))
        await update($, apiModel, () => u.model)
      }
      await refreshModel($)
      await refreshContext($)
    }
    return next(e)
  })

  // ---- Desenho -------------------------------------------------------------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const c: RcCaps | null = await read($, caps)
    const ctx: RcContext | null = await read($, context)
    const tk: RcTokens | null = await read($, tokens)
    const model: string | null = await read($, currentModel)
    const effRaw: string | null = await read($, effectiveEffort)
    const mReq: RcRequest | null = await read($, modelReq)
    const eReq: RcRequest | null = await read($, effortReq)
    const askClear: boolean = await read($, confirmClear)
    const note: RcNotice | null = await read($, notice)

    const isDesktop = e.surface === 'desktop'
    const { Box, Text, Button } = $.ui.resolve(e)
    const svgTable = isDesktop ? $.ui.resolve(e) : null
    const Svg = svgTable !== null && 'Svg' in svgTable ? svgTable.Svg : null
    const narrow = e.props.bodyColumns < 100
    const isWorking = e.props.isWorking
    const eff: RcEffort | null = isEffort(effRaw) ? effRaw : null

    // Bloco 1: contexto e modelos
    const percent = ctx?.percent
    const tone = contextTone(percent)
    const ctxKnown = percent !== undefined
    const ctxText = ctxKnown
      ? `${Math.round(percent)}% · ${formatTokens(ctx?.tokens)}/${formatTokens(ctx?.window)}`
      : ctx?.window !== undefined
        ? `indisponível · limite ${formatTokens(ctx.window)}`
        : 'indisponível'
    const ctxAlt = ctxKnown
      ? `Contexto: ${Math.round(percent)}% usado, ${formatTokens(ctx?.tokens)} de ${formatTokens(ctx?.window)} tokens`
      : 'Contexto: indisponível até a primeira resposta'

    const models = c?.models ?? []
    const modelButtons = models.map(m => {
      const isCurrent = matchesModel(m.id, model)
      const isTarget = mReq !== null && mReq.target === m.id && (mReq.status === 'sending' || mReq.status === 'pending')
      return (
        <Button
          key={`model-${m.id}`}
          label={isTarget ? `${m.label}…` : m.label}
          variant={isCurrent ? 'primary' : 'secondary'}
          dimColor={!c?.hasModel}
          onPress={() => selectModel($, m.id)}
        />
      )
    })

    const block1 = (
      <Box key="rc-block-context" flexDirection="column" gap={0}>
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          <Text weight="semibold">Router de Modelos</Text>
          <Text dimColor>· Contexto</Text>
          {Svg !== null ? (
            <Svg source={contextGauge(percent, tone)} alt={ctxAlt} width={132} height={10} />
          ) : (
            <Text color={tone}>{textBar(percent)}</Text>
          )}
          <Text tabular color={ctxKnown ? tone : undefined} dimColor={!ctxKnown}>
            {ctxText}
          </Text>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {c?.hasModel === false ? <Text dimColor>Modelos: /model indisponível</Text> : modelButtons}
        </Box>
      </Box>
    )

    // Bloco 2: tokens e esforço
    const tokensText =
      tk === null
        ? 'Tokens: aguardando a 1ª resposta'
        : `Tokens ↓ ${formatTokens(tk.input)} entrada · ↑ ${formatTokens(tk.output)} saída`
    const effortButtons = EFFORTS.map(level => {
      const isEff = eff === level
      const isTarget =
        eReq !== null && eReq.target === level && (eReq.status === 'sending' || eReq.status === 'pending')
      const label = narrow ? EFFORT_SHORT[level] : EFFORT_LABEL[level]
      return (
        <Button
          key={`effort-${level}`}
          label={isTarget ? `${label}…` : label}
          variant={isEff ? 'primary' : 'secondary'}
          dimColor={!c?.hasEffort}
          onPress={() => selectEffort($, level)}
        />
      )
    })
    const effAlt = `Esforço efetivo: ${effortName(effRaw)}`

    const block2 = (
      <Box key="rc-block-tokens" flexDirection="column" gap={0}>
        <Text tabular dimColor={tk === null}>
          {tokensText}
        </Text>
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1}>
          <Text dimColor>Esforço</Text>
          {Svg !== null ? (
            <Svg source={effortSteps(eff)} alt={effAlt} width={44} height={16} />
          ) : (
            <Text>{effortText(eff)}</Text>
          )}
          <Text weight="semibold">{effortName(effRaw)}</Text>
          {c?.hasEffort === false ? <Text dimColor>(/effort indisponível)</Text> : effortButtons}
        </Box>
      </Box>
    )

    // Bloco 3: ações
    const block3 = askClear ? (
      <Box key="rc-block-actions" flexDirection="column" gap={0}>
        <Text color="error">Limpar a conversa atual?</Text>
        <Box flexDirection="row" columnGap={1}>
          <Button key="clear-confirm" label="Confirmar limpeza" variant="primary" onPress={() => runClear($)} />
          <Button key="clear-cancel" label="Cancelar" onPress={() => update($, confirmClear, () => false)} />
        </Box>
      </Box>
    ) : (
      <Box key="rc-block-actions" flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center">
        <Button key="compact" label="Compactar" onPress={() => runCompact($, isWorking)} />
        {c?.hasClear ? (
          <Button key="clear" label="Limpar" onPress={() => update($, confirmClear, () => true)} />
        ) : null}
        {c?.hasGoal ? <Button key="goal" label="Meta" onPress={() => openGoal($)} /> : null}
      </Box>
    )

    const status = [
      requestText('Modelo', mReq, mReq ? modelLabel(mReq.target) : ''),
      requestText('Esforço', eReq, eReq ? effortName(eReq.target) : ''),
      note?.text ?? null,
    ].filter((s): s is string => s !== null)

    return (
      <Box key="rc-root" flexDirection="column" gap={0}>
        <Box
          flexDirection={narrow ? 'column' : 'row'}
          flexWrap="wrap"
          justifyContent="space-between"
          columnGap={3}
          rowGap={0}
        >
          {block1}
          {block2}
          {block3}
        </Box>
        {status.length > 0 ? (
          <Text dimColor={note?.kind !== 'error'} color={note?.kind === 'error' ? 'error' : undefined} wrap="truncate-end">
            {status.join(' · ')}
          </Text>
        ) : null}
      </Box>
    )
  })
}
