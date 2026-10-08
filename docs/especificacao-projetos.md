# Projetos — especificação (decisões do dono, 2026-10-07)

Fonte: planilha do dono "Cronograma do Projeto — Nutribalance 1 Litro" (`Rascunho.xlsx`) e as decisões
tomadas na conversa de 2026-10-07. Desenho para aprovar: https://claude.ai/artifact/3cq7SLRyFhq4iAcKbuEQp4

## A ideia

O projeto nasce do **briefing** (a ideia e o objetivo), não das fases. O dono do projeto nem sempre sabe as
fases e atividades de todos os setores: **cada setor sabe o que deve fazer**. Então:

1. **O dono cria o projeto com o briefing**: nome, objetivo, entrega desejada, anexos — e marca os
   **setores envolvidos** (pode indicar uma pessoa de referência por setor). Fases e atividades não são
   obrigatórias na criação.
2. **Cada setor marcado é avisado** e lê o briefing.
3. **O próprio setor planeja a sua parte**: cria as atividades do setor (pessoa, datas, dependência, fator
   externo, link) e as coloca numa **fase** — escolhe uma que já existe ou cria uma nova.
4. **As fases são compartilhadas** entre os setores. O dono só reordena e renomeia, para manter a sequência.
5. **Cada setor edita só as suas atividades.** O dono vê tudo e ajusta qualquer coisa; o projeto mostra
   quais setores **ainda não planejaram**.
6. **Modelos**: "Salvar como modelo" e "Criar a partir de modelo" (fases + atividades sugeridas por setor,
   sem datas e pessoas). A planilha do Nutribalance pode virar o primeiro modelo ("Lançamento de produto").

## Quem faz o quê

| Quem | Pode |
|---|---|
| Dono do projeto | Criar/editar o briefing, marcar setores, reordenar/renomear fases, editar qualquer atividade |
| Pessoa do setor que está no projeto | Criar e editar as atividades **do seu setor**; criar fase nova |
| Gestor do setor (caixinha "Transferir" no perfil do setor) | Tudo das atividades do seu setor, inclusive redistribuir |
| Responsável pela atividade | Atualizar % concluído e farol, comentar, anexar |
| Diretoria | Ver todos os projetos |

- **Quem vê:** só a equipe do projeto + Diretoria. Quem recebe uma atividade entra na equipe sozinho.
- **Atividade pode nascer só do setor** (sem pessoa); aparece como "sem responsável" para o gestor do setor.
- O histórico guarda quem mudou o quê.

## A atividade (colunas da planilha)

ID (fase.atividade, numerado sozinho) · Fase · Atividade (título) · Descrição · Link de acesso · Dependência
(outra atividade) · Fator externo (texto: "aguardando fornecedor") · Setor responsável · Pessoa responsável ·
Início · Término · Farol · % concluído.

**Farol**: Não iniciado, Em andamento, Atrasado (acende sozinho quando passa do término sem 100%),
Finalizado. O % da fase e do projeto é a média das atividades.

## Avisos

Setor marcado no projeto; atividade atribuída; atividade a 2 dias do término; atividade atrasada;
dependência liberada ("2.1 finalizada — pode começar a 2.2"). As atividades da pessoa aparecem em
"Minhas tarefas", no "Comece por" da tela inicial e no resumo da Lyra.

## Modelos (dono, 2026-10-08: "Sim, os 12")

Os projetos que uma indústria de cosméticos capilares profissional faz no ano, prontos em "Começar de um
modelo" (migration `20261217010000`, função `semear_modelos_da_industria`). Só fases e atividades por setor,
sem datas, pessoas ou duração. Base: Anvisa RDC 752/2022 (Grau 1 = notificação; Grau 2 = registro:
progressiva, coloração, ondulação, pomada), o fluxo de P&D cosmético e o Forteplus (cadastro, lote, estoque).

| Modelo | Para quê |
|---|---|
| Lançamento de produto — Grau 1 (notificação) | Shampoo, máscara, leave-in… (o do Nutribalance + Anvisa, Forteplus, lote piloto) |
| Lançamento de produto — Grau 2 (registro) | Progressiva, coloração, pomada: testes de segurança/eficácia e registro antes de vender |
| Extensão de linha (novo tamanho, cor ou kit) | Versão nova de produto que já existe |
| Reformulação / troca de matéria-prima | Fórmula nova de produto que já vende; corte de lote no Forteplus |
| Troca de embalagem ou rótulo | Frasco, fornecedor de embalagem, arte ou advertência nova |
| Homologação de fornecedor | Aprovar matéria-prima ou embalagem de fornecedor novo |
| Adequação a nova norma da Anvisa | Resolução nova com prazo: fórmulas, rótulos e estoque |
| Descontinuação de produto | Tirar de linha: esgotar estoque, avisar, inativar no Forteplus |
| Evento, feira ou convenção | Feira do setor, convenção de distribuidores |
| Campanha comercial ou promoção | Promoção do mês/trimestre |
| Programa de treinamento técnico | Salões, distribuidores, equipe interna |
| Lote com problema / recolhimento | Rastrear no Forteplus, bloquear, recolher, ação corretiva |

## Base existente

Tabelas `projects` e `project_members` (vazias na produção, módulo pausado em `config/telas-pausadas.ts`).
A construção estende: fases, atividades, setores do projeto, modelos.
