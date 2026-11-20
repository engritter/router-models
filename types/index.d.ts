// Contrato de estado do Router de Modelos.
// Cada valor fica em $.state sob o nome do plugin e sobrevive a recargas do módulo.

/** Níveis de esforço que esta build do Claude Code declara (ModelEffort). */
export type RcEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Um modelo oferecido no seletor. */
export type RcModelOption = {
  /** O valor enviado a /model (id ou alias). */
  id: string
  /** Rótulo curto exibido no botão. */
  label: string
}

/** O que o aplicativo expõe nesta sessão, descoberto em tempo de execução. */
export type RcCaps = {
  hasModel: boolean
  hasEffort: boolean
  hasClear: boolean
  hasCompact: boolean
  hasGoal: boolean
  models: RcModelOption[]
  /** De onde veio a lista: linha `model` do /config ou lista de reserva do plugin. */
  modelSource: 'config' | 'fallback'
}

/** Janela de contexto como $.session.usage() a informa. Campos ausentes = indisponível. */
export type RcContext = {
  tokens?: number
  window?: number
  percent?: number
}

/** Tokens somados das respostas do loop principal desde o carregamento ou o último /clear. */
export type RcTokens = {
  input: number
  output: number
  turns: number
}

/** Uma troca pedida pelo usuário e o que o aplicativo confirmou. */
export type RcRequest = {
  target: string
  /**
   * sending: comando enviado, ainda sem resposta do aplicativo.
   * pending: o aplicativo aceitou o comando; aguardando a confirmação.
   * confirmed: o aplicativo reportou o valor pedido.
   * failed: o comando falhou ou o aplicativo reportou outro valor.
   */
  status: 'sending' | 'pending' | 'confirmed' | 'failed'
  detail?: string
}

export type RcNotice = {
  kind: 'info' | 'error'
  text: string
}

declare module 'claude-code' {
  interface PluginState {
    'router-models': {
      caps: RcCaps | null
      context: RcContext | null
      tokens: RcTokens | null
      currentModel: string | null
      apiModel: string | null
      effectiveEffort: string | null
      modelReq: RcRequest | null
      effortReq: RcRequest | null
      confirmClear: boolean
      notice: RcNotice | null
    }
  }
}
