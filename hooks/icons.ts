// Elementos gráficos próprios do Router de Modelos, desenhados aqui como SVG.
// Nenhum arquivo de imagem externo; nada é carregado da rede.
import { EFFORTS, EFFORT_COLOR } from './logic'
import type { RcEffort, RcParts } from '../types'

const TONE_COLOR = {
  success: '#34c38f',
  warning: '#f5a524',
  error: '#ef5350',
  inactive: '#7c8494',
} as const

/** Cores dos segmentos fixos da barra de contexto. */
export const PART_COLOR = {
  instructions: '#7aa7ff',
  tools: '#a78bfa',
  reserve: '#7c8494',
} as const

export type Tone = keyof typeof TONE_COLOR

export function toneColor(tone: Tone): string {
  return TONE_COLOR[tone]
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`
}

/**
 * Barra de contexto arredondada. Com o detalhamento, desenha da esquerda para
 * a direita instruções, ferramentas e conversa (esta na cor do estado), e a
 * reserva de compactação encostada na ponta direita. Sem detalhamento, um
 * preenchimento único na cor do estado. Sem dado nenhum, só o trilho.
 */
export function contextBar(
  percent: number | undefined,
  tone: Tone,
  parts: RcParts | null,
  window: number | undefined,
  width = 130,
  height = 8,
): string {
  const r = height / 2
  const track = `<rect width="${width}" height="${height}" rx="${r}" fill="#7c8494" opacity="0.28"/>`
  const known = percent !== undefined && Number.isFinite(percent)
  if (!known) return svg(width, height, track)

  const usedW = (clamp(percent, 0, 100) / 100) * width
  let body = ''
  const used = parts ? parts.instructions + parts.tools + parts.conversation : 0
  if (parts && used > 0) {
    // As proporções vêm do detalhamento; o comprimento total segue o percentual do app.
    const segs: [number, string][] = [
      [parts.instructions, PART_COLOR.instructions],
      [parts.tools, PART_COLOR.tools],
      [parts.conversation, TONE_COLOR[tone]],
    ]
    let x = 0
    for (const [tokens, color] of segs) {
      const w = (tokens / used) * usedW
      if (w <= 0) continue
      body += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="${color}"/>`
      x += w
    }
    if (window !== undefined && window > 0 && parts.reserve > 0) {
      const rw = Math.min(width - usedW, (parts.reserve / window) * width)
      if (rw > 0) {
        body += `<rect x="${(width - rw).toFixed(2)}" y="0" width="${rw.toFixed(2)}" height="${height}" fill="${PART_COLOR.reserve}" opacity="0.55"/>`
      }
    }
  } else {
    body = `<rect x="0" y="0" width="${usedW.toFixed(2)}" height="${height}" fill="${TONE_COLOR[tone]}"/>`
  }
  return svg(
    width,
    height,
    `<defs><clipPath id="rc-ctx"><rect width="${width}" height="${height}" rx="${r}"/></clipPath></defs>` +
      `<g clip-path="url(#rc-ctx)">${track}${body}</g>`,
  )
}

/** Centro horizontal do ponto `i` numa trilha de largura `width`. */
export function dotX(i: number, width: number): number {
  const step = width / EFFORTS.length
  return step * i + step / 2
}

/**
 * Trilha de esforço em pílula: um ponto por nível, preenchimento até o nível
 * na cor dele e a bolinha branca em cima. Sem nível conhecido, só os pontos.
 */
export function effortTrack(level: RcEffort | null, width = 120, height = 22): string {
  const r = height / 2
  const cy = height / 2
  const index = level === null ? -1 : EFFORTS.indexOf(level)
  const color = level === null ? '#7c8494' : EFFORT_COLOR[level]
  let body = `<rect width="${width}" height="${height}" rx="${r}" fill="#7c8494" opacity="0.22"/>`
  if (index >= 0) {
    const fillW = dotX(index, width) + r
    body += `<rect width="${fillW.toFixed(2)}" height="${height}" rx="${r}" fill="${color}"/>`
  }
  EFFORTS.forEach((_, i) => {
    const filled = i <= index
    body += `<circle cx="${dotX(i, width).toFixed(2)}" cy="${cy}" r="2" fill="#ffffff" opacity="${filled ? 0.85 : 0.45}"/>`
  })
  if (index >= 0) {
    body += `<circle cx="${dotX(index, width).toFixed(2)}" cy="${cy}" r="${(r - 2).toFixed(2)}" fill="#ffffff"/>`
  }
  return svg(width, height, body)
}

/** Trilha textual: "●━━○" com a bolinha no nível. */
export function effortText(level: RcEffort | null): string {
  const index = level === null ? -1 : EFFORTS.indexOf(level)
  return EFFORTS.map((_, i) => (i === index ? '●' : i < index ? '━' : '·')).join('')
}
