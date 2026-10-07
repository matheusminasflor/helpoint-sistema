# Plano — módulo Projetos por setor (2026-10-07)

Especificação: `docs/especificacao-projetos.md`. Desenho aprovado: https://claude.ai/artifact/3cq7SLRyFhq4iAcKbuEQp4

## O que já existe e é reaproveitado

- `projects` (dono, criado por, prazo, status, `description`) e `project_members` (equipe), com o autor e o
  novo dono entrando na equipe por trigger, e RLS "só a equipe + dono/admin da empresa" (20260930*).
- **A atividade do projeto É uma linha de `tasks`** com `project_id` (decisão de 2026-09-13, mantida). Isso dá
  de graça: aparece no "Comece por" da Home (`DailyCuration` lê `tasks` do usuário), no resumo da Lyra, nos
  relatórios de produtividade (`completed_at`) e no quadro antigo. O farol usa o `status` que a tarefa já
  tem (`pending` = Não iniciado, `in_progress` = Em andamento, `completed` = Finalizado; Atrasado é derivado).
- `notify_users` para avisos; `tem_permissao(..., 'tickets', 'transfer')` = gestor do setor (a mesma caixinha
  que já define o gestor da fila); `setores_da_pessoa` = de que setores a pessoa é; `src/lib/anexos-no-storage.ts`
  para anexos; o cron SQL (`cron.schedule`) para os avisos de prazo.

## Banco (migrations 20261215010000…)

1. **Tipos de aviso** (arquivo só com `alter type … add value`): `projeto_setor_chamado`, `projeto_atividade`,
   `projeto_prazo`, `projeto_dependencia`.
2. **`projects`** ganha `e_modelo boolean`. O **objetivo/briefing** é a `description` que já existe; a
   **entrega** é o `due_date` que já existe.
3. **`project_setores`** (projeto, setor, pessoa de referência opcional, avisado em). "Planejou" é derivado:
   o setor tem ao menos uma atividade no projeto.
4. **`project_fases`** (projeto, nome, ordem) — compartilhadas entre os setores.
5. **`tasks`** ganha, para a atividade: `fase_id`, `setor`, `link`, `fator_externo`, `depende_de`,
   `percentual` (0–100), `inicio`, `termino`. `due_date` (o que a Home ordena) passa a ser preenchido a partir do
   `termino` (18h do dia, horário de Brasília). Trigger sincroniza: 100% ⇒ Finalizado (+ `completed_at`);
   Finalizado ⇒ 100%; % > 0 num Não iniciado ⇒ Em andamento.
6. **`task_comentarios`** (atividade, autor, texto, `sistema`) — atualizações com @menção e o **histórico**
   (o trigger escreve "Fulano mudou % de 20 → 40", responsável, datas, farol).
7. **`project_anexos`** (projeto, atividade opcional, arquivo) + bucket privado `projetos` (pasta = id do projeto).

### Uma regra só de permissão

| Função | Verdadeiro quando |
|---|---|
| `ve_todos_os_projetos(u)` | dono/admin da empresa, ou quem tem o módulo **Diretoria** |
| `project_visivel(p)` (existente, ampliada) | está na equipe; vê todos; projeto é **modelo** (todos da empresa veem modelos); é **referência** de um setor envolvido; é **gestor** de um setor envolvido |
| `pode_editar_projeto(p)` | dono do projeto ou admin |
| `pessoa_do_setor(u, s)` | `s` está em `setores_da_pessoa(u)` |
| `gestor_do_setor(u, s)` | caixinha "Transferir" (`tickets.transfer`) no perfil do setor `s` |
| `pode_planejar_setor(p, s)` | edita o projeto; ou o setor `s` está envolvido e a pessoa é gestora dele, ou é do setor e está na equipe |

- Atividade **com setor**: criar/apagar/editar tudo = `pode_planejar_setor`. O **responsável** (`user_id`) edita
  só `percentual`, farol (`status`) e comenta — um trigger barra as outras colunas (42501).
- Atividade **sem setor** (quadro antigo): continua como era — quem vê o projeto mexe.
- Fase: qualquer pessoa da equipe cria; só quem edita o projeto renomeia/reordena/apaga.
- Setores do projeto: só quem edita o projeto marca/desmarca.
- **Quem recebe atividade entra na equipe** (trigger). A referência do setor também entra.

### Avisos

Setor chamado (referência + gestores do setor), atividade atribuída (responsável), dependência liberada
(responsável da atividade que dependia; sem responsável, gestores do setor), e um cron diário às 8h:
atividade vence em 2 dias, e atividade atrasada (uma vez só). Modelos nunca avisam.

### Modelos

Um projeto com `e_modelo = true`. `salvar_como_modelo(projeto, nome)` copia fases, atividades (título, descrição,
setor, fase, dependência) e setores — sem datas, pessoas e %. `criar_projeto_do_modelo(modelo, nome, objetivo,
entrega, setores)` faz o caminho inverso. A planilha do dono vira o modelo **"Lançamento de produto"** por
migration de semente, só na empresa que já existe.

## Telas

`/projetos` (cartões), `/projetos/novo` (briefing + setores + modelo), `/projetos/:id` com abas **Cronograma**
(fases que abrem/fecham, barra de tempo com hoje, etiquetas de dependência e fator externo, KPIs com (i)),
**Setores e planejamento** e **Briefing**; a **atividade** abre num painel com campos, atualizações (@menção),
anexos e histórico; **"+ Atividade do meu setor"** só oferece os setores que a pessoa pode planejar;
`/projetos/minhas` (as minhas atividades + as sem responsável dos setores que eu giro). "Salvar como modelo" no
cabeçalho do projeto. O módulo sai de `TELAS_PAUSADAS` (Metas continua pausado). O quadro antigo
(`ProjetoQuadro`) sai — o cronograma o substitui.

## Decisões tomadas sozinho (para o dono saber)

1. **Atividade = `tasks`**, não tabela nova: a atividade já aparece na Home, na Lyra e nos relatórios.
2. **Criar projeto**: qualquer pessoa logada cria, sem caixinha (o dono: "o colaborador vai em Projetos e cria").
3. **Diretoria** = quem tem o **módulo Diretoria** (ou dono/admin). Não o cargo de gerente — o teste antigo
   exige que gestor que não participa não veja.
4. **Gestor do setor** = caixinha "Transferir" do setor (já é a do gestor da fila e do aviso de vencido).
5. **Gestor e referência de setor envolvido veem o projeto** mesmo sem estar na equipe (senão não planejam).
6. **Planilha → modelo**: atividade "A / B" fica no **primeiro** setor e o segundo vai na descrição ("junto com
   Comercial"); P&D/Laboratório, Regulatório e Garantia da Qualidade → Qualidade; Fábrica/PCP → Produção;
   Suprimentos/Compras → Compras; Design → Marketing; "Teste de eficácia" (sem setor) → Qualidade. Sem
   dependências (a planilha não as preenche). O modelo não tem dono: quem edita é o admin.
7. **Histórico** por comentário de sistema, não pela auditoria (`audit_tasks` é só do admin; a equipe precisa ler).
8. **O quadro antigo sai** da tela (as tarefas continuam no banco).
