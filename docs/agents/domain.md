# Documentos de domínio

## A fonte é o sistema que roda

Não há `CONTEXT.md` nem `docs/adr/`. O que descreve o domínio é, nesta ordem:

1. **O banco** do `test-helpoint`: tabelas, policies, triggers, funções SQL.
   Onde qualquer documento divergir do banco, o banco ganha.
2. **`docs/inventario-sistema.md`** — rotas, telas, componentes, fórmulas,
   tabelas e fluxos, módulo a módulo. Leia a seção do módulo antes de mexer nele.
3. **`docs/nao-funciona.md`** — o que existe no código e não funciona. Leia
   antes de "consertar" ou "completar" qualquer coisa.
4. **`docs/decisoes.md`** — as decisões de arquitetura (ADR-001 em diante).

## Use o vocabulário do sistema

Quando a saída nomear um conceito (título de ticket, nome de teste, proposta
de refatoração), use o nome que a tabela, a coluna ou a tela já usa. Se o
conceito não existe em lugar nenhum, é sinal: ou a linguagem está sendo
inventada (reconsidere), ou há lacuna real (registre para `/domain-modeling`).

## ADR novo

Entra como seção nova em `docs/decisoes.md`, numerado na sequência. Não criar
arquivo solto.

## Conflito com ADR

Se a saída contradiz um ADR, diga isso explicitamente em vez de sobrescrever em
silêncio:

> _Contradiz o ADR-001 (Supabase é o backend), mas vale reabrir porque…_
