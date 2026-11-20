// Router de Modelos (router-models): barra acima da caixa de mensagem com contexto,
// modelos, tokens, esforço e ações. Usa apenas a API de function hooks
// declarada pelo Claude Code (verificada na build 2.1.325).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage } from 'claude-code'

import type { RcCaps, RcContext, RcEffort, RcNotice, RcParts, RcRequest, RcTokens } from '../types'
import { contextBar, effortText, effortTrack, toneColor } from './icons'
import {
  EFFORTS,
  EFFORT_COLOR,
  EFFORT_LABEL,
  EFFORT_SHORT,
  capsFrom,
  contextTone,
  effortName,
  formatTokens,
  groupContext,
  isEffort,
  judgeEffort,
  judgeModel,
  matchesModel,
  modelLabel,
  requestText,
  textBar,
} from './logic'

const caps = atom({ plugin: 'router-models', key: 'caps' } as const, null)
const context = atom({ plugin: 'router-models', key: 'context' } as const, null)
const tokens = atom({ plugin: 'router-models', key: 'tokens' } as const, null)
const currentModel = atom({ plugin: 'router-models', key: 'currentModel' } as const, null)
const apiModel = atom({ plugin: 'router-models', key: 'apiModel' } as const, null)
const effectiveEffort = atom({ plugin: 'router-models', key: 'effectiveEffort' } as const, null)
const modelReq = atom({ plugin: 'router-models', key: 'modelReq' } as const, null)
const effortReq = atom({ plugin: 'router-models', key: 'effortReq' } as const, null)
const confirmClear = atom({ plugin: 'router-models', key: 'confirmClear' } as const, false)
const notice = atom({ plugin: 'router-models', key: 'notice' } as const, null)
const parts = atom({ plugin: 'router-models', key: 'parts' } as const, null)
const effortPreview = atom({ plugin: 'router-models', key: 'effortPreview' } as const, null)
const trackFailed = atom({ plugin: 'router-models', key: 'trackFailed' } as const, false)

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
  await refreshParts($)
}

/** Divide o uso por categoria (estimativa local do /context, sem requisição). */
async function refreshParts($: $): Promise<void> {
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const categories = usage.context.breakdown?.categories
    const grouped: RcParts | null = categories ? groupContext(categories) : null
    await update($, parts, () => grouped)
  } catch {
    await update($, parts, () => null)
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
  await update($, effortPreview, () => level)
  await update($, effortReq, () => mk(level, 'sending'))
  try {
    await $.command.run({ command: 'effort', args: level })
  } catch (err) {
    await update($, effortPreview, () => null)
    await update($, effortReq, () => mk(level, 'failed', message(err)))
    await say($, { kind: 'error', text: `Não foi possível trocar o esforço: ${message(err)}` })
    return
  }
  // O esforço efetivo só é conhecido na próxima requisição (turn.step).
  await update($, effortReq, () => mk(level, 'pending', 'aguardando a próxima requisição'))
  await update($, effortPreview, () => null)
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
      await refreshParts($)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      // Nova conversa: contadores recomeçam; o contexto volta a "aguardando".
      await update($, tokens, () => null)
      await update($, context, () => null)
      await update($, parts, () => null)
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

  // ---- Trilha de esforço (Client) --------------------------------------------

  on('ui.message', async ($, e, next) => {
    if (e.element !== 'effort-track') return next(e)
    const data = e.data as { preview?: unknown; level?: unknown } | null
    const pick = (v: unknown): RcEffort | null =>
      typeof v === 'number' && Number.isInteger(v) ? (EFFORTS[v] ?? null) : null
    if (data && 'preview' in data) {
      const level = pick(data.preview)
      await update($, effortPreview, () => level)
    } else if (data && 'level' in data) {
      const level = pick(data.level)
      if (level !== null) await selectEffort($, level)
      else await update($, effortPreview, () => null)
    }
    return next(e)
  })

  on('ui.fault', async ($, e, next) => {
    // Se a camada de toque falhar, a trilha passa a usar os botões − e +.
    await update($, trackFailed, () => true)
    await update($, effortPreview, () => null)
    return next(e)
  })

  // ---- Desenho -------------------------------------------------------------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const c: RcCaps | null = await read($, caps)
    const ctx: RcContext | null = await read($, context)
    const pt: RcParts | null = await read($, parts)
    const tk: RcTokens | null = await read($, tokens)
    const model: string | null = await read($, currentModel)
    const effRaw: string | null = await read($, effectiveEffort)
    const preview: string | null = await read($, effortPreview)
    const failedTrack: boolean = await read($, trackFailed)
    const mReq: RcRequest | null = await read($, modelReq)
    const eReq: RcRequest | null = await read($, effortReq)
    const askClear: boolean = await read($, confirmClear)
    const note: RcNotice | null = await read($, notice)

    const isDesktop = e.surface === 'desktop'
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Svg = isDesktop && 'Svg' in table ? table.Svg : null
    const Client = isDesktop && 'Client' in table ? table.Client : null
    const narrow = e.props.bodyColumns < 90
    const isWorking = e.props.isWorking

    const eff: RcEffort | null = isEffort(effRaw) ? effRaw : null
    // Durante o arrasto ou o envio, a trilha mostra o nível pedido.
    const shown: RcEffort | null = isEffort(preview) ? preview : eff

    // ---- Bloco 1: contexto em cima dos modelos
    const percent = ctx?.percent
    const tone = contextTone(percent)
    const ctxKnown = percent !== undefined
    const ctxAlt = ctxKnown
      ? `Contexto: ${Math.round(percent)}% usado, ${formatTokens(ctx?.tokens)} de ${formatTokens(ctx?.window)} tokens`
      : 'Contexto: indisponível até a primeira resposta'

    const modelButtons = (c?.models ?? []).map(m => {
      const isCurrent = matchesModel(m.id, model)
      const isTarget =
        mReq !== null && mReq.target === m.id && (mReq.status === 'sending' || mReq.status === 'pending')
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
      <Box key="rc-block-context" flexDirection="column" rowGap={1}>
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          <Text dimColor>Contexto</Text>
          {Svg !== null ? (
            <Svg source={contextBar(percent, tone, pt, ctx?.window)} alt={ctxAlt} width={130} height={8} />
          ) : (
            <Text color={tone}>{textBar(percent)}</Text>
          )}
          <Text tabular weight="semibold" color={ctxKnown ? toneColor(tone) : undefined} dimColor={!ctxKnown}>
            {ctxKnown ? `${Math.round(percent)}%` : 'indisponível'}
          </Text>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
          {c?.hasModel === false ? <Text dimColor>Modelos: /model indisponível</Text> : modelButtons}
        </Box>
      </Box>
    )

    // ---- Bloco 2: tokens em cima do esforço
    const pill = (
      <Box
        key="rc-tokens"
        flexDirection="row"
        alignItems="center"
        columnGap={1}
        borderStyle="round"
        borderColor="subtle"
        paddingX={1}
      >
        <Text tabular weight="semibold">
          {ctx?.window !== undefined ? `${formatTokens(ctx.tokens)}/${formatTokens(ctx.window)}` : 'indisponível'}
        </Text>
        <Text dimColor>|</Text>
        <Text tabular color="#34c38f">{`↓${formatTokens(tk?.input)}`}</Text>
        <Text dimColor>|</Text>
        <Text tabular color="#ef5350">{`↑${formatTokens(tk?.output)}`}</Text>
      </Box>
    )

    const levelName = shown === null ? effortName(effRaw) : EFFORT_LABEL[shown]
    const levelColor = shown === null ? undefined : EFFORT_COLOR[shown]
    const trackAlt = `Esforço: ${levelName}. Níveis: ${EFFORTS.map(l => EFFORT_LABEL[l]).join(', ')}`
    const idx = shown === null ? -1 : EFFORTS.indexOf(shown)
    const stepTo = (d: number) => {
      const base = idx === -1 ? 2 : idx
      const target = EFFORTS[Math.max(0, Math.min(EFFORTS.length - 1, base + d))]
      return target ?? 'high'
    }

    let effortControl
    if (c?.hasEffort === false) {
      effortControl = <Text dimColor>(/effort indisponível)</Text>
    } else if (Svg !== null && Client !== null && !failedTrack) {
      // Desenho da trilha com a camada de toque transparente por cima.
      effortControl = (
        <Box key="rc-track" position="relative" width={15}>
          <Svg source={effortTrack(shown)} alt={trackAlt} width={120} height={22} />
          <Box position="absolute" top={0} left={0} width="100%" height="100%">
            <Client key="effort-track" module="./effort-track.tsx" props={null} width="100%" height="100%" />
          </Box>
        </Box>
      )
    } else if (Svg !== null) {
      effortControl = (
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          <Button key="effort-down" label="−" onPress={() => selectEffort($, stepTo(-1))} />
          <Svg source={effortTrack(shown)} alt={trackAlt} width={120} height={22} />
          <Button key="effort-up" label="+" onPress={() => selectEffort($, stepTo(1))} />
        </Box>
      )
    } else {
      effortControl = (
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1}>
          <Text color={levelColor}>{effortText(shown)}</Text>
          {EFFORTS.map(level => (
            <Button
              key={`effort-${level}`}
              label={narrow ? EFFORT_SHORT[level] : EFFORT_LABEL[level]}
              variant={eff === level ? 'primary' : 'secondary'}
              onPress={() => selectEffort($, level)}
            />
          ))}
        </Box>
      )
    }

    const block2 = (
      <Box key="rc-block-tokens" flexDirection="column" rowGap={1}>
        <Box flexDirection="row">{pill}</Box>
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1}>
          <Text dimColor>Esforço</Text>
          <Text key="rc-effort-name" weight="semibold" color={levelColor} dimColor={shown === null}>
            {levelName}
          </Text>
          {effortControl}
        </Box>
      </Box>
    )

    // ---- Bloco 3: ações (Limpar em cima, Compactar embaixo)
    const clearRow = askClear ? (
      <Box flexDirection="row" columnGap={1} alignItems="center">
        <Button key="clear-confirm" label="Confirmar limpeza" onPress={() => runClear($)} />
        <Button key="clear-cancel" label="Cancelar" onPress={() => update($, confirmClear, () => false)} />
      </Box>
    ) : c?.hasClear ? (
      <Button key="clear" label="Limpar" onPress={() => update($, confirmClear, () => true)} />
    ) : null

    const block3 = (
      <Box
        key="rc-block-actions"
        flexDirection="column"
        alignItems={narrow ? 'flex-start' : 'flex-end'}
        rowGap={1}
      >
        {clearRow}
        <Button key="compact" label="Compactar" onPress={() => runCompact($, isWorking)} />
      </Box>
    )

    const status = [
      mReq?.status === 'confirmed' ? null : requestText('Modelo', mReq, mReq ? modelLabel(mReq.target) : ''),
      eReq?.status === 'confirmed' ? null : requestText('Esforço', eReq, eReq ? effortName(eReq.target) : ''),
      note?.text ?? null,
    ].filter((s): s is string => s !== null)

    return (
      <Box key="rc-root" flexDirection="column" rowGap={0}>
        <Box
          flexDirection={narrow ? 'column' : 'row'}
          flexWrap="wrap"
          justifyContent="space-between"
          alignItems="flex-start"
          columnGap={3}
          rowGap={1}
        >
          {block1}
          {block2}
          {block3}
        </Box>
        {status.length > 0 ? (
          <Text
            dimColor={note?.kind !== 'error'}
            color={note?.kind === 'error' ? 'error' : undefined}
            wrap="truncate-end"
          >
            {status.join(' · ')}
          </Text>
        ) : null}
      </Box>
    )
  })
}
