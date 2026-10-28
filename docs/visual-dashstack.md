# Visual DashStack

Decisão do dono (2026-10-28): "Dashstack quero visual igual a esse no sistema. Porém precisa refazer o visual completo
do sistema e aplicar o dashstack, não quero nenhum módulo, aba diferente ou antigo. Precisa seguir esse padrão decidido
agora."

- Referência: Figma da comunidade "DashStack — Free Admin Dashboard UI Kit" (fileKey `BVZp2X5POtFTlgErZ5mmp6`).
  Páginas: Light Style 1/2, Dark Style 1/2, Component (`0:40222`).
- A proposta comparada (DashStack × Cloudhub × hoje): https://claude.ai/artifact/Y8vBNvhx2wc2cYWttVwbYk
- **Idêntico à template.** Onde a template contraria regra antiga (texto preto puro, letra branca em amarelo,
  rótulo a 70%), vale a template — "seguir esse padrão decidido agora".
- **Claro e escuro**, os dois da DashStack.
- **Entrega por etapas:** primeiro a base (toda tela muda junto), depois módulo a módulo.

## As medidas

| Peça | DashStack |
|---|---|
| Letra | Nunito Sans |
| Fundo | `#F5F6FA` (escuro `#1B2431`) |
| Cartão, menu, topo | branco (escuro `#273142`), sem borda, sombra `6px 6px 54px rgba(0,0,0,.05)`, cantos 14 |
| Texto | `#202224` (escuro branco); rótulo = o texto a 70% |
| Azul (botão, item ativo) | `#4880FF`, letra branca |
| Botão | cantos 8, negrito 14, 36 de altura; o secundário contornado em `#D5D5D5` |
| Campo | fundo `#F5F6FA` (escuro `#323D4E`), borda `#D5D5D5`, cantos 4,5 |
| Busca do topo | cápsula 388 × 38 |
| Tabela | cabeçalho numa faixa `#F1F4F9` arredondada (12), negrito 14; linha com borda fina |
| Etiqueta | a cor a 20% no fundo, a palavra em negrito 12, cantos 4,5 — Completed `#00B69B`, Processing `#6226EF`, Rejected `#EF3826`, On Hold `#FFA756`, In Transit `#BA29FF` |
| Abas | caixa contornada; a ativa azul cheia ("Day / Week / Month") |
| Cartão de número | rótulo 16 a 70%, número 28 negrito, ícone em quadrado 60 × 60 (cantos 23) com a cor a 21%, tendência com seta verde `#00B69B` / rosa `#F93C65` |
| Menu lateral | 240 de largura, item 14 seminegrito; o ativo é o bloco azul cheio com a barrinha de 4px na borda da tela; títulos de grupo em caixa alta 12 a 60% |
| Topo | 70 de altura: busca à esquerda; tema e a pessoa (foto, nome, papel, seta) à direita. Sem o caminho "Início › …" |
| Título da página | 32 negrito (24 no celular), direto sobre o fundo |
| Celular | barra de baixo branca, item ativo azul, "Novo" num quadrado azul de cantos 12 |

Estado do chamado → etiqueta: Recebido = cinza, Com o setor = Processing, Esperando = On Hold, Atrasado = Rejected,
Concluído = Completed. Setores → as cores dos rótulos da caixa de entrada (Primary, Work, Friends, Social) e dos
ícones.

## Onde mora

- Cores e letra: `src/index.css` (`:root` e `.dark`) e `tailwind.config.ts` (cantos, sombras, letra).
- O tema da empresa (Configurações › Marca) também manda na cor e na letra: na produção ele foi posto nos valores da
  DashStack no dia da troca.
- Peças: `src/components/ui/*` (botão, cartão, etiqueta, campo, tabela, abas, janelas), `KPICard`,
  `WorkOSStatsCard`, `layout/*` (menu, topo, `ContaNoTopo`, barra do celular, título).

## Etapas

1. **Base** — cores, letra, cantos, sombras, peças, menu, topo, título, barra do celular, cartão de número.
2. **Cores fixas** — as cores escritas direto no código (`helpoint/cor-fixa`, `scripts/cor-fixa-por-arquivo.mjs`)
   passam para os tokens, para nenhuma tela ficar com cor antiga.
3. **Módulo a módulo**, cada tela no desenho da tela correspondente da DashStack: Início = Dashboard; filas de
   chamados e listas = Order Lists; Chat = Inbox; Agenda = Calendar; Inventário e estoques = Product Stock;
   Pessoas = Team; Configurações = Settings; Tarefas = To-Do; Notícias = cartões de Products/Favorites.

Cada etapa sobe com o CI verde e vira notícia no Jornal com print.
