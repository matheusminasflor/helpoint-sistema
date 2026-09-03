# Issue tracker: markdown local

Specs e tickets vivem como arquivos em `.scratch/`, fora do Git. O repositório
tem remote (`matheusminasflor/helpoint-sistema`), mas o GitHub Issues não é
usado: o tracker é local por escolha, para o trabalho dos agentes não depender
de rede nem de permissão.

## Convenções

- Um esforço por diretório: `.scratch/<slug>/`
- A spec é `.scratch/<slug>/spec.md`; o plano executável, `.scratch/<slug>/plan.md`
- Tickets são um arquivo por ticket em `.scratch/<slug>/issues/<NN>-<slug>.md`,
  numerados a partir de `01` — nunca um arquivo único com todos
- O estado de triagem é uma linha `Status:` no topo do arquivo
- Conversa e histórico entram no fim, sob `## Comments`

`.scratch/` é rascunho de trabalho, não artefato do produto. O que sobrevive a
um ticket vira código, teste, ou seção em `docs/decisoes.md`.

## Quando uma skill disser "publique no issue tracker"

Crie o arquivo sob `.scratch/<slug>/`, criando o diretório se preciso.

## Quando uma skill disser "busque o ticket"

Leia o arquivo no caminho citado. Normalmente o caminho ou o número vem na
própria mensagem.

## Wayfinding (`/wayfinder`)

- **Mapa**: `.scratch/<esforco>/map.md`
- **Ticket filho**: `.scratch/<esforco>/issues/NN-<slug>.md`, com `Type:`
  (`research`/`prototype`/`grilling`/`task`) e `Status:` (`claimed`/`resolved`)
- **Bloqueio**: linha `Blocked by: NN, NN` no topo; livre quando todos os
  citados estiverem `resolved`
- **Fronteira**: o menor número aberto, desbloqueado e não reivindicado
- **Reivindicar**: `Status: claimed` antes de qualquer trabalho
- **Resolver**: resposta sob `## Answer`, `Status: resolved`, e um ponteiro
  (resumo + link) nas decisões do `map.md`
