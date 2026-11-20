// Elementos gráficos próprios do Router de Modelos, desenhados aqui como SVG.
// Nenhum arquivo de imagem externo; nada é carregado da rede.
import { EFFORTS } from './logic'
import type { RcEffort } from '../types'

const TONE_COLOR = {
  success: '#2fa889',
  warning: '#d99a2b',
  error: '#d9534a',
  inactive: '#8a8f98',
} as const

export type Tone = keyof typeof TONE_COLOR

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Medidor de contexto: trilho com marcações em 25/50/75%, um entalhe no limiar
 * de alerta (85%) e o preenchimento proporcional na cor do estado.
 */
export function contextGauge(percent: number | undefined, tone: Tone, width = 132, height = 10): string {
  const r = height / 2
  const known = percent !== undefined && Number.isFinite(percent)
  const fill = known ? (clamp(percent, 0, 100) / 100) * width : 0
  const ticks = [0.25, 0.5, 0.75]
    .map(t => `<rect x="${(t * width).toFixed(1)}" y="2" width="1" height="${height - 4}" fill="#ffffff" opacity="0.35"/>`)
    .join('')
  const alertX = (0.85 * width).toFixed(1)
  const body = known
    ? `<rect x="0" y="0" width="${fill.toFixed(1)}" height="${height}" fill="${TONE_COLOR[tone]}"/>`
    : `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#rc-hatch)"/>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><clipPath id="rc-track"><rect width="${width}" height="${height}" rx="${r}"/></clipPath>` +
    `<pattern id="rc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="3" height="6" fill="#8a8f98" opacity="0.35"/></pattern></defs>` +
    `<g clip-path="url(#rc-track)">` +
    `<rect width="${width}" height="${height}" fill="#8a8f98" opacity="0.22"/>` +
    body +
    ticks +
    `<rect x="${alertX}" y="0" width="1.5" height="${height}" fill="${TONE_COLOR.error}" opacity="0.7"/>` +
    `</g></svg>`
  )
}

/**
 * Indicador de esforço em degraus: cinco barras de alturas crescentes, cheias
 * até o nível efetivo. Sem nível conhecido, todas vazadas.
 */
export function effortSteps(level: RcEffort | null, width = 44, height = 16): string {
  const index = level === null ? -1 : EFFORTS.indexOf(level)
  const gap = 2
  const bar = (width - gap * (EFFORTS.length - 1)) / EFFORTS.length
  const bars = EFFORTS.map((_, i) => {
    const h = ((i + 1) / EFFORTS.length) * (height - 2) + 2
    const x = i * (bar + gap)
    const y = height - h
    return i <= index
      ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bar.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="#5b6ee8"/>`
      : `<rect x="${(x + 0.5).toFixed(1)}" y="${(y + 0.5).toFixed(1)}" width="${(bar - 1).toFixed(1)}" height="${(h - 1).toFixed(1)}" rx="1.5" fill="none" stroke="#8a8f98" stroke-opacity="0.6"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bars}</svg>`
}

/** Versão textual dos degraus para superfícies sem SVG: "▮▮▮▯▯". */
export function effortText(level: RcEffort | null): string {
  const index = level === null ? -1 : EFFORTS.indexOf(level)
  return EFFORTS.map((_, i) => (i <= index ? '▮' : '▯')).join('')
}
