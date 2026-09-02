# Issue tracker: markdown local

Este repositório não tem remote (`git remote -v` vazio), então não há GitHub Issues
para as skills usarem. Specs e tickets vivem como arquivos em `.scratch/`.

## Convenções

- Um esforço por diretório: `.scratch/<slug>/`
- A spec é `.scratch/<slug>/spec.md`
- Tickets são um arquivo por ticket em `.scratch/<slug>/issues/<NN>-<slug>.md`,
  numerados a partir de `01` — nunca um arquivo único com todos
- O estado de triagem é uma linha `Status:` no topo do arquivo
- Conversa e histórico entram no fim, sob `## Comments`

`.scratch/` fica fora do versionamento (`.gitignore`): é rascunho de trabalho,
não artefato do produto. O que sobrevive a um ticket vira código, teste, ou
seção em `docs/arquitetura.md`.

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
