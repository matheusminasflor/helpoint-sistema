# Documentos de domínio

## Antes de explorar, leia

**`docs/arquitetura.md`** — é o `CONTEXT.md` e o `docs/adr/` deste projeto ao
mesmo tempo. Contém o glossário, o schema das 139 tabelas, os ADRs 001–018 e o
roteiro por fase (§10).

Isto foge do layout padrão das skills (`CONTEXT.md` na raiz + `docs/adr/*.md`) de
propósito: o documento nasceu antes das skills, é a fonte única do projeto, e
fragmentá-lo agora criaria duas verdades em vez de uma. Leia a seção citada —
`§3` multi-tenancy, `§5` schema, `§7` segurança, `§9` testes, `§10` roteiro —
antes de decidir qualquer coisa na área.

## Use o vocabulário do documento

Quando a saída nomear um conceito do domínio (título de ticket, nome de teste,
proposta de refatoração), use o termo como está em `docs/arquitetura.md`. Se o
conceito ainda não existe lá, é sinal: ou a linguagem está sendo inventada
(reconsidere), ou há lacuna real (registre para `/domain-modeling`).

## ADR novo

ADRs entram como seção nova em `docs/arquitetura.md`, numerados na sequência
existente (o último é o ADR-018). Um arquivo solto em `docs/adr/` seria a
segunda verdade que este arquivo existe para evitar.

## Conflito com ADR

Se a saída contradiz um ADR, diga isso explicitamente em vez de sobrescrever em
silêncio:

> _Contradiz o ADR-006 (nenhuma policy chama `auth.uid()` direto), mas vale
> reabrir porque…_
