# Router de Modelos

Nome técnico (plugin, pasta e repositório): `router-modelos`.

Plugin para o **Claude Code** que adiciona uma barra compacta acima da caixa de
mensagem. A barra mostra o uso do contexto, troca o modelo e o nível de esforço
(com confirmação do próprio aplicativo), conta os tokens de entrada e saída e
oferece as ações Compactar, Limpar e Meta.

Autor: Safety Engenharia · Licença: MIT · Versão: 0.1.0

> **Estado:** pronto para revisão. O plugin foi validado (`claude plugin validate`)
> e testado (`claude plugin test`, 22 testes) no Claude Code 2.1.325, mas **ainda
> não foi instalado nem usado num app real**. Faça um teste manual antes de publicar
> (veja [Teste manual sugerido](#teste-manual-sugerido)).

## Recursos

A barra tem três blocos. Em telas estreitas, eles ficam um embaixo do outro.

| Bloco | Conteúdo |
| --- | --- |
| 1. Contexto e modelos | Título **Router de Modelos** e medidor do contexto com percentual e `usados/limite` (ex.: `42% · 84k/200k`), na cor do estado: verde abaixo de 65%, âmbar até 85%, vermelho acima. Abaixo dele, um botão por modelo; o modelo ativo aparece destacado. |
| 2. Tokens e esforço | `Tokens ↓ entrada · ↑ saída`, somados das respostas do loop principal. Medidor de esforço em degraus, o nome do nível **efetivo** e um botão por nível (Baixo, Médio, Alto, Extra, Máximo). |
| 3. Ações | **Compactar** (`/compact`), **Limpar** (`/clear`, pede confirmação) e **Meta** (`/goal`, mantém o texto já digitado). |

Comportamentos:

- **Trocas verificadas.** Cada troca passa por quatro estados, mostrados na linha
  de status: *enviando…* → *solicitado, aguardando confirmação* → *confirmado*
  ou *falha* (com o motivo). O modelo é confirmado quando `$.session.model()` ou
  a próxima requisição (`turn.step`) reportam o modelo pedido. O esforço é
  confirmado quando a próxima requisição sai com o nível pedido. Se o aplicativo
  rebaixar o nível (limite do modelo ou de política), a barra mostra o valor
  efetivo, por exemplo `efetivo: Alto`.
- **Sem números inventados.** Uma métrica que a API não informa aparece como
  `indisponível` ou `—`, nunca como 0. Exemplos: o contexto antes da primeira
  resposta, os tokens antes da primeira resposta e o esforço num modelo que não
  usa esse parâmetro.
- **Limpar** pede confirmação na própria barra (*Confirmar limpeza* /
  *Cancelar*). Nada é apagado no primeiro clique.
- **Meta** coloca `/goal ` antes do que já está escrito na caixa e deixa o
  cursor no fim. Não envia nada sozinho e não duplica o prefixo.
- **Controles que o aplicativo não oferece ficam indisponíveis.** Na abertura da
  sessão, o plugin lê `$.command.list()`. Se `/model`, `/effort`, `/clear` ou
  `/goal` não existirem, o controle correspondente avisa que está indisponível ou
  some. O plugin não tenta contornar a ausência.
- **Gráficos próprios.** No desktop, o medidor de contexto e os degraus de esforço
  são SVG gerados pelo plugin. No terminal, são barras de texto (`▰▱`, `▮▯`).
- **Acessibilidade.** Todos os controles são botões nativos da superfície, com
  rótulos por extenso. Os SVGs têm texto alternativo (`alt`). Os estados não
  dependem só de cor: há sempre texto.

## Requisitos

- **Claude Code 2.1.325 ou compatível**, com a API de *function hooks*. Essa API
  está em *early access* e pode mudar entre versões. Para conferir a sua versão:
  `claude --version`.
- Superfícies: **desktop** (app Claude, aba Code) com a experiência completa;
  **terminal** com barras em texto; **mobile** desenha a barra sem SVG. A API
  declara a lista de linhas acima da caixa (`AbovePromptList`) apenas para
  terminal, desktop e mobile, então a extensão do VS Code pode não exibir a barra.
- Nenhuma dependência externa. Não há `node_modules` nem pacotes npm.

## Instalação

Repositório: https://github.com/engritter/router-modelos

Num terminal com sessão do Claude Code aberta:

```
/plugin install router-modelos --marketplace engritter/router-modelos
```

Responda `y` para adicionar o marketplace e escolha o escopo (usuário é o primeiro).

Pelo shell:

```bash
claude plugin install router-modelos --marketplace engritter/router-modelos
```

No **app desktop**, onde `/plugin` não roda: clique em **+** ao lado da caixa de
mensagem → **Plugins** → **Add marketplace** com `engritter/router-modelos`
→ **Add plugin**.

Para testar a partir de uma pasta local, sem instalar:

```bash
claude --plugin-dir ./router-modelos
```

### Configuração opcional

O plugin tem uma opção, `models`: uma lista de ids ou aliases separados por
vírgula (ex.: `opus,sonnet,haiku`) que substitui a lista de modelos do seletor.
Ela aparece no `/config` depois da instalação.

## Uso

- Clique num **modelo** para trocar. O botão pedido mostra `…` até a confirmação.
- Clique num **nível de esforço**. O nível efetivo aparece depois da próxima
  requisição ao modelo.
- **Compactar** resume a conversa. Se uma resposta estiver em andamento, o
  comando entra na fila do aplicativo.
- **Limpar** → **Confirmar limpeza** inicia uma conversa nova e zera os contadores.
- **Meta** prepara `/goal <seu texto>` na caixa. Complete e pressione Enter.

## Limitações

Todas vêm da API pública desta build. Nenhuma integração foi inventada.

1. **Não existe API para listar os modelos disponíveis.** A lista vem de três
   fontes, nesta ordem: (a) a opção `models` do plugin; (b) as opções da linha
   `model` do `/config`, se o aplicativo as expuser; (c) uma lista de reserva com
   os ids da família Claude 5 conhecidos nesta build (`claude-fable-5-2`,
   `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`). Um modelo da lista
   de reserva que a conta não tenha vai falhar na troca, e a falha aparece na barra.
2. **Não existe leitura direta do esforço configurado.** O valor efetivo é lido de
   cada requisição do loop principal (`turn.step`). Antes da primeira requisição,
   e em modelos sem esforço, ele aparece como `indisponível`.
3. **Os níveis exibidos são os cinco que a API declara** (`low` … `max`). Não há
   API que diga quais níveis cada modelo aceita. Quando o modelo rebaixa o nível,
   a barra mostra o valor efetivo.
4. **Os tokens contam a partir do carregamento do plugin ou do último `/clear`.**
   A API não fornece o total histórico de uma sessão retomada. A entrada inclui
   os tokens lidos e gravados em cache. Turnos de subagentes não entram na conta.
5. **O contexto é o mesmo número da linha de status** (`$.session.usage()`). Ele
   fica indisponível até a primeira resposta e logo após uma compactação.
6. **Custo em dólares não é exibido.** A API informa uma estimativa de preço de
   API, que não corresponde ao que um assinante paga.
7. **A barra de contexto nativa não é ocultada.** O plugin não mexe nas linhas
   de outros plugins.
8. **Compactar** usa `/compact`. Sem esse comando, usa `$.session.compact()`, que
   o aplicativo recusa durante uma resposta; nesse caso a barra pede para esperar.
9. **Sem telemetria e sem rede.** O plugin não faz requisições HTTP, não lê
   credenciais e não grava nada fora do estado da sessão (`$.state`). O
   `claude plugin validate` lista todas as chamadas que ele faz.

## Desinstalação

```
/plugin uninstall router-modelos
```

ou, pelo shell, `claude plugin uninstall router-modelos`. No app desktop,
use **+** → **Plugins** e remova o plugin. Para remover também o marketplace:
`claude plugin marketplace remove router-modelos`.

## Desenvolvimento

```
router-modelos/
├── .claude-plugin/
│   ├── plugin.json        manifesto (nome, versão, autor, opção `models`)
│   └── marketplace.json   permite instalar direto do repositório
├── hooks/
│   ├── hooks.json         aponta o módulo de hooks
│   ├── register.tsx       eventos, ações e desenho da barra
│   ├── logic.ts           funções puras (formatação, verificação, rascunho do /goal)
│   └── icons.ts           SVGs próprios e equivalentes em texto
├── types/index.d.ts       contrato do estado ($.state)
├── tests/                 testes do kit oficial `claude-code/testing`
├── tsconfig.json
├── LICENSE
└── README.md
```

Para verificar:

```bash
claude plugin validate .
claude plugin test .
```

Os testes simulam o aplicativo abaixo do plugin e cobrem: contexto indisponível
versus informado, troca de modelo confirmada, pendente e com falha, esforço
confirmado e ajustado, contagem de tokens (subagentes excluídos, zerada no
`/clear`), confirmação do Limpar, Meta preservando o texto, Compactar, comandos
ausentes e layout estreito, no terminal, desktop, VS Code e mobile.

### Teste manual sugerido

1. Rode `claude --plugin-dir <pasta>` num terminal, ou instale a partir de um
   repositório privado.
2. Envie uma mensagem e confira se o contexto e os tokens deixam de aparecer
   como indisponíveis.
3. Troque o modelo e o esforço e confira os estados *solicitado* → *confirmado*.
4. Teste o Limpar com Cancelar e depois com Confirmar.
5. Digite um texto e clique em Meta.

## Comparação com a referência

Referência funcional: [edirsooo/seletor-modelo](https://github.com/edirsooo/seletor-modelo).
A implementação é original: nenhum código, imagem ou SVG foi copiado.

| Recurso | Referência | Router de Modelos |
| --- | --- | --- |
| Barra de contexto com % | Sim, segmentada por categoria | Sim, com marcações e limiar de alerta; mostra também `usados/limite` |
| Tokens de entrada/saída | Sim | Sim; `—` até a 1ª resposta, zera no `/clear` |
| Seleção de modelo | 4 botões fixos | Lista do `/config` quando exposta, senão reserva, ou a opção `models` |
| Controle de esforço | Trilha arrastável (módulo `Client`) e −/+ | Botões por nível e medidor em degraus; mostra o valor **efetivo** |
| Pendente vs. confirmado | Pedido otimista, apagado no fim do turno | Estados enviando, pendente, confirmado e falha, verificados pelo app |
| Sem `/model` ou `/effort` | Força o modelo/esforço em cada requisição | Desativa o controle e avisa; não força nada por baixo |
| Compactar | Sim | Sim |
| Limpar | Imediato | **Com confirmação** |
| Meta (`/goal`) | Substitui a caixa por `/goal ` | **Preserva o texto já digitado** |
| Oculta a barra nativa | Sim | Não (limitação 7) |
| Custo | Não exibido | Não exibido |
| Licença | Nenhuma declarada | MIT |
| Testes | Não | 22 testes com o kit oficial |

## Licença

[MIT](LICENSE) © 2026 Safety Engenharia. O projeto não tem dependências de
terceiros. As declarações de tipos que o Claude Code gera localmente em
`.claude-plugin/types/` pertencem à Anthropic e ficam fora do repositório (veja
`.gitignore`).
