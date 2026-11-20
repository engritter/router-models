// Camada de toque da trilha de esforço (módulo Client, só no desktop).
// Fica transparente por cima do desenho da trilha: clicar num ponto escolhe o
// nível; segurar e arrastar mostra a prévia e solta no nível sob o ponteiro.
// Não desenha nada visível nem tem acesso a $: só envia mensagens ao plugin.
import type { ClientModule } from 'claude-code'

import { trackIndex } from './logic'

type State = { dragging: boolean; last: number }

const EffortTrack: ClientModule<null, State> = (_props, s) => {
  const { Text } = s.elements
  if (s.state === undefined) {
    s.setState({ dragging: false, last: -1 })
    s.onPointer(ev => {
      const cur = s.state ?? { dragging: false, last: -1 }
      const x = ev.fine?.x ?? ev.x + 0.5
      const idx = trackIndex(x, s.columns)
      if (ev.type === 'down' && ev.button === 'left') {
        s.setState({ dragging: true, last: idx })
        s.post({ preview: idx })
      } else if (ev.type === 'move' && cur.dragging && idx !== cur.last) {
        s.setState({ dragging: true, last: idx })
        s.post({ preview: idx })
      } else if (ev.type === 'up' && cur.dragging) {
        s.setState({ dragging: false, last: -1 })
        s.post({ level: idx })
      }
    })
  }
  return <Text>{' '.repeat(Math.max(1, s.columns))}</Text>
}

export default EffortTrack
