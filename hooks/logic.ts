// Funções puras do Router de Modelos: sem $, sem estado, testáveis isoladamente.
import type { CommandInfo, ConfigRow } from 'claude-code'

import type { RcCaps, RcEffort, RcModelOption, RcRequest } from '../types'

export const PLUGIN = 'router-models'

/** Os cinco níveis que a API desta build declara (ModelEffort), do mais leve ao mais pesado. */
export const EFFORTS: readonly RcEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const EFFORT_LABEL: Record<RcEffort, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
  xhigh: 'Extra',
  max: 'Máximo',
}

/** Rótulo curto (botões) de cada nível. */
export const EFFORT_SHORT: Record<RcEffort, string> = {
  low: 'B',
  medium: 'M',
  high: 'A',
  xhigh: 'X',
  max: 'Máx',
}

/**
 * Lista de reserva usada só quando o aplicativo não expõe as opções da linha
 * `model` do /config. São os ids da família Claude 5 conhecidos nesta build;
 * cada troca continua sendo verificada pelo aplicativo. Pode ser substituída
 * pela opção `models` do plugin.
 */
export const FALLBACK_MODELS: readonly string[] = [
  'claude-fable-5-2',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
]

const FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'] as const

export function isEffort(value: unknown): value is RcEffort {
  return typeof value === 'string' && (EFFORTS as readonly string[]).includes(value)
}

/** "claude-opus-5-5" -> "Opus 5.5"; "sonnet" -> "Sonnet"; outros valores ficam como vieram. */
export function modelLabel(id: string): string {
  const lower = id.toLowerCase()
  if (lower === 'default') return 'Padrão'
  const family = FAMILIES.find(f => lower.includes(f))
  if (family === undefined) return id
  const name = family.charAt(0).toUpperCase() + family.slice(1)
  const version = /(\d+)[-.](\d+)/.exec(lower.slice(lower.indexOf(family) + family.length))
  return version ? `${name} ${version[1]}.${version[2]}` : name
}

/** Forma comparável de um nome de modelo: sem "claude", sem sufixos [..], só letras e dígitos. */
export function normalizeModel(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/claude/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Se o modelo que o aplicativo reportou corresponde ao pedido. Aceita id
 * completo, id com data, alias de família ("opus") e nome de exibição
 * ("Opus 5.5"). Famílias diferentes nunca correspondem.
 */
export function matchesModel(requested: string, reported: string | null | undefined): boolean {
  if (!reported) return false
  const a = normalizeModel(requested)
  const b = normalizeModel(reported)
  if (a === '' || b === '') return false
  if (a === b || b.startsWith(a) || a.startsWith(b)) {
    const fa = FAMILIES.find(f => a.includes(f))
    const fb = FAMILIES.find(f => b.includes(f))
    return fa === fb
  }
  return false
}

/** Lê a lista de modelos: opção do usuário, depois a linha `model` do /config, depois a reserva. */
export function modelOptions(
  configRows: readonly ConfigRow[] | null,
  override: string,
): { models: RcModelOption[]; source: RcCaps['modelSource'] } {
  const fromOption = override
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '')
  if (fromOption.length > 0) {
    return { models: fromOption.map(id => ({ id, label: modelLabel(id) })), source: 'fallback' }
  }
  const row = configRows?.find(r => r.key === 'model')
  const options = row?.options?.filter(o => o.trim() !== '') ?? []
  if (options.length > 0) {
    return { models: options.map(id => ({ id, label: modelLabel(id) })), source: 'config' }
  }
  return { models: FALLBACK_MODELS.map(id => ({ id, label: modelLabel(id) })), source: 'fallback' }
}

/** Monta as capacidades a partir do que o aplicativo listou. */
export function capsFrom(
  commands: readonly CommandInfo[],
  configRows: readonly ConfigRow[] | null,
  override: string,
): RcCaps {
  const names = new Set(commands.map(c => c.name))
  const { models, source } = modelOptions(configRows, override)
  return {
    hasModel: names.has('model'),
    hasEffort: names.has('effort'),
    hasClear: names.has('clear'),
    hasCompact: names.has('compact'),
    hasGoal: names.has('goal'),
    models,
    modelSource: source,
  }
}

/** Formata contagens de tokens em pt-BR: 950, 12,3k, 215k, 1,2M. */
export function formatTokens(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const fmt = (v: number, digits: number) =>
    v.toFixed(digits).replace(/\.0+$/, '').replace('.', ',')
  if (abs < 1000) return String(Math.round(n))
  if (abs < 100_000) return `${fmt(n / 1000, 1)}k`
  if (abs < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${fmt(n / 1_000_000, 1)}M`
}

/** Cor temática da barra conforme o uso do contexto. */
export function contextTone(percent: number | undefined): 'success' | 'warning' | 'error' | 'inactive' {
  if (percent === undefined || !Number.isFinite(percent)) return 'inactive'
  if (percent >= 85) return 'error'
  if (percent >= 65) return 'warning'
  return 'success'
}

/** Barra textual de largura fixa para superfícies sem gráfico: "▰▰▰▱▱▱". */
export function textBar(percent: number | undefined, width = 12): string {
  if (percent === undefined || !Number.isFinite(percent)) return '▱'.repeat(width)
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

/** Avalia uma troca de modelo pendente contra o modelo que o aplicativo reportou. */
export function judgeModel(req: RcRequest | null, reported: string | null | undefined): RcRequest | null {
  if (req === null || req.status !== 'pending' || !reported) return req
  if (matchesModel(req.target, reported)) {
    return { target: req.target, status: 'confirmed', detail: `aplicativo reporta ${reported}` }
  }
  return { target: req.target, status: 'failed', detail: `o aplicativo reportou ${reported}` }
}

/** Avalia uma troca de esforço pendente contra o esforço da próxima requisição. */
export function judgeEffort(req: RcRequest | null, effective: string | number | undefined): RcRequest | null {
  if (req === null || req.status !== 'pending') return req
  if (effective === undefined) {
    return { target: req.target, status: 'failed', detail: 'o modelo atual não informa esforço' }
  }
  if (String(effective) === req.target) {
    return { target: req.target, status: 'confirmed', detail: 'aplicado na última requisição' }
  }
  return {
    target: req.target,
    status: 'failed',
    detail: `efetivo: ${effortName(effective)} (ajustado pelo modelo ou pela política)`,
  }
}

export function effortName(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return 'indisponível'
  return isEffort(value) ? EFFORT_LABEL[value] : String(value)
}

export function requestText(kind: 'Modelo' | 'Esforço', req: RcRequest | null, label: string): string | null {
  if (req === null) return null
  switch (req.status) {
    case 'sending':
      return `${kind}: enviando ${label}…`
    case 'pending':
      return `${kind}: ${label} solicitado, aguardando confirmação`
    case 'confirmed':
      return `${kind}: ${label} confirmado`
    case 'failed':
      return `${kind}: falha ao aplicar ${label}${req.detail ? ` (${req.detail})` : ''}`
  }
}

/**
 * O texto que o botão Meta deixa na caixa: "/goal " antes do que já foi
 * digitado, sem duplicar o prefixo. Retorna também a posição do cursor.
 */
export function goalDraft(current: string): { text: string; cursor: number } {
  const trimmed = current.replace(/^\s+/, '')
  if (/^\/goal(\s|$)/.test(trimmed)) {
    return { text: trimmed, cursor: trimmed.length }
  }
  const text = trimmed === '' ? '/goal ' : `/goal ${trimmed}`
  return { text, cursor: text.length }
}
