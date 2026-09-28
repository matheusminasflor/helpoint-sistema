-- Compras é módulo próprio: tem a sua própria porta.
--
-- PEDIDO DO DONO em 2026-09-27: *"vamos retirar o Compras de Financeiro? afinal o
-- módulo Financeiro está poluído demais por conta do setor de compras, vamos fazer o
-- Compras ser um módulo em vez de estar dentro de Financeiro."* Medido: das 10 telas
-- do Financeiro, **4 eram de Compras** — e o próprio menu dizia "Chamados **e
-- compras** do Financeiro".
--
-- ── O QUE ESTA MIGRATION FECHA, E NÃO ESTAVA NO PEDIDO ───────────────────────
--
-- Ao ler as policies para reescrevê-las, apareceu que **as compras eram abertas para
-- qualquer pessoa logada**: `tenant_id = get_user_tenant_id()` e mais nada, sem
-- checar módulo nenhum. Quem tinha só o RH lia toda solicitação de compra da empresa,
-- com valor, fornecedor e laudo. Não era vazamento entre empresas — o isolamento por
-- tenant funcionava —, era o módulo não existir para filtrar. Separar Compras é a
-- hora de fechar isso, e é o ganho silencioso desta leva.
--
-- ── QUEM VÊ O QUE, AGORA ────────────────────────────────────────────────────
--
--   solicitação  — quem tem Compras vê todas; **quem abriu vê a sua**, sempre.
--                  Pedir uma compra é de qualquer setor (é a decisão do dono: "a
--                  solicitação de compra JÁ é o pedido", sem fila de chamado
--                  separada), então quem pede precisa acompanhar o que pediu.
--   orçamento    — quem tem Compras, e quem abriu a solicitação daquele orçamento.
--                  O requisitante vê por quanto sua compra foi cotada; não mexe.
--   catálogo     — TODO MUNDO lê (é a lista do que se pode pedir; esconder faria o
--                  formulário de solicitação nascer vazio). Só Compras escreve.
--   teto de gasto — **o Financeiro define, Compras respeita**: decisão do dono,
--                  perguntada com as três opções. Compras LÊ o teto (precisa saber
--                  quanto sobrou) e não escreve. Quem cuida do dinheiro decide o
--                  limite; quem gasta obedece — teto que o gastador altera não é teto.
--
-- ── PERMISSÕES: `financeiro:purchases:*` VIRA `compras:*` ───────────────────
--
-- Zero pessoas tinham perfil de acesso atribuído (`user_access_profiles` vazio) e
-- zero tinham o módulo `financeiro` concedido — conferido antes de mexer. Então não
-- há migração de dado nem ninguém perde acesso: este é o momento mais barato
-- possível para a troca, e foi por isso que ela foi feita agora.

-- ── 1. A porta do módulo ─────────────────────────────────────────────────────
-- Corpo espelhado em `has_fin_access`, trocando só o módulo. `pode_responder_sobre`
-- primeiro é o guarda da leva B (não responder sobre gente de outra empresa).
create or replace function public.has_compras_access(_user_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND (
    EXISTS (SELECT 1 FROM public.user_module_access WHERE user_id = _user_id AND module = 'compras')
    OR public.is_supervisor_or_higher(_user_id))
$function$;

comment on function public.has_compras_access(uuid) is
  'Tem o modulo Compras, ou e supervisor para cima. Espelha has_fin_access. 2026-09-27.';

-- Regra 14 do pgTAP: nasce agora, então herda `execute` para PUBLIC — e `anon` é
-- público. Função `security definer` alcançável por `anon` é porta aberta.
revoke all on function public.has_compras_access(uuid) from public, anon;
grant execute on function public.has_compras_access(uuid) to authenticated;

-- ── 2. As solicitações ───────────────────────────────────────────────────────
drop policy if exists "tenant read purchase requests"   on public.compras_solicitacoes;
drop policy if exists "tenant insert purchase requests" on public.compras_solicitacoes;
drop policy if exists "tenant update purchase requests" on public.compras_solicitacoes;
drop policy if exists "admins delete purchase requests" on public.compras_solicitacoes;

create policy "compras_solicitacoes_select" on public.compras_solicitacoes
  for select using (
    tenant_id = (select public.get_user_tenant_id())
    and ((select public.has_compras_access(auth.uid())) or created_by = auth.uid())
  );

-- INSERT continua de qualquer pessoa da empresa, e é de propósito: pedir uma compra
-- é o direito de qualquer setor. O `created_by = auth.uid()` fecha o único abuso
-- possível — abrir pedido no nome de outra pessoa.
create policy "compras_solicitacoes_insert" on public.compras_solicitacoes
  for insert with check (
    tenant_id = (select public.get_user_tenant_id())
    and created_by = auth.uid()
  );

create policy "compras_solicitacoes_update" on public.compras_solicitacoes
  for update using (
    tenant_id = (select public.get_user_tenant_id())
    and (created_by = auth.uid() or (select public.has_compras_access(auth.uid())))
  ) with check (
    tenant_id = (select public.get_user_tenant_id())
    and (created_by = auth.uid() or (select public.has_compras_access(auth.uid())))
  );

create policy "compras_solicitacoes_delete" on public.compras_solicitacoes
  for delete using (
    tenant_id = (select public.get_user_tenant_id())
    and (select public.is_manager_or_higher(auth.uid()))
  );

-- ── 3. Os orçamentos ─────────────────────────────────────────────────────────
drop policy if exists "tenant read quotes"   on public.compras_orcamentos;
drop policy if exists "tenant insert quotes" on public.compras_orcamentos;
drop policy if exists "tenant update quotes" on public.compras_orcamentos;
drop policy if exists "tenant delete quotes" on public.compras_orcamentos;

-- A subconsulta olha a tabela PAI, não a própria — então não cai na lição 13 do
-- pgTAP (função que reconsulta a própria tabela é cega para a linha que nasce).
create policy "compras_orcamentos_select" on public.compras_orcamentos
  for select using (
    tenant_id = (select public.get_user_tenant_id())
    and (
      (select public.has_compras_access(auth.uid()))
      or exists (
        select 1 from public.compras_solicitacoes r
         where r.id = request_id and r.tenant_id = compras_orcamentos.tenant_id
           and r.created_by = auth.uid()
      )
    )
  );

create policy "compras_orcamentos_escreve" on public.compras_orcamentos
  for all using (
    tenant_id = (select public.get_user_tenant_id())
    and (select public.has_compras_access(auth.uid()))
  ) with check (
    tenant_id = (select public.get_user_tenant_id())
    and (select public.has_compras_access(auth.uid()))
  );

-- ── 4. O catálogo de produtos ────────────────────────────────────────────────
drop policy if exists "tenant read products"   on public.compras_produtos;
drop policy if exists "tenant insert products" on public.compras_produtos;
drop policy if exists "tenant update products" on public.compras_produtos;
drop policy if exists "admins delete products" on public.compras_produtos;

-- Leitura para toda a empresa: é a lista do que se pode pedir, e o formulário de
-- solicitação nasce dela. Esconder o catálogo faria qualquer pessoa abrir um pedido
-- sem opção nenhuma.
create policy "compras_produtos_select" on public.compras_produtos
  for select using (tenant_id = (select public.get_user_tenant_id()));

create policy "compras_produtos_insert" on public.compras_produtos
  for insert with check (
    tenant_id = (select public.get_user_tenant_id())
    and ((select public.is_manager_or_higher(auth.uid()))
         or (select public.tem_permissao(auth.uid(), 'compras', 'catalogo', 'edit')))
  );

create policy "compras_produtos_update" on public.compras_produtos
  for update using (
    tenant_id = (select public.get_user_tenant_id())
    and ((select public.is_manager_or_higher(auth.uid()))
         or (select public.tem_permissao(auth.uid(), 'compras', 'catalogo', 'edit')))
  ) with check (
    tenant_id = (select public.get_user_tenant_id())
    and ((select public.is_manager_or_higher(auth.uid()))
         or (select public.tem_permissao(auth.uid(), 'compras', 'catalogo', 'edit')))
  );

create policy "compras_produtos_delete" on public.compras_produtos
  for delete using (
    tenant_id = (select public.get_user_tenant_id())
    and (select public.is_manager_or_higher(auth.uid()))
  );

-- ── 5. O teto de gasto: Financeiro escreve, Compras lê ───────────────────────
drop policy if exists "tenant read department budgets"    on public.fin_department_budgets;
drop policy if exists "managers write department budgets" on public.fin_department_budgets;

create policy "fin_department_budgets_le_quem_gasta_e_quem_paga" on public.fin_department_budgets
  for select using (
    tenant_id = (select public.get_user_tenant_id())
    and ((select public.has_fin_access(auth.uid())) or (select public.has_compras_access(auth.uid())))
  );

-- Escrita só do Financeiro — decisão do dono. `purchases:manage_budget` virou
-- `budgets:manage`, no departamento que de fato decide.
create policy "fin_department_budgets_escreve_o_financeiro" on public.fin_department_budgets
  for all using (
    tenant_id = (select public.get_user_tenant_id())
    and (select public.has_fin_access(auth.uid()))
    and ((select public.is_manager_or_higher(auth.uid()))
         or (select public.tem_permissao(auth.uid(), 'financeiro', 'budgets', 'manage')))
  ) with check (
    tenant_id = (select public.get_user_tenant_id())
    and (select public.has_fin_access(auth.uid()))
    and ((select public.is_manager_or_higher(auth.uid()))
         or (select public.tem_permissao(auth.uid(), 'financeiro', 'budgets', 'manage')))
  );

-- ── 5b. O modo do teto, achado pela própria verificação ──────────────────────
--
-- `fin_budget_settings` (o modo: teto por setor ou nenhum) também usava
-- `financeiro:purchases:manage_budget`. **Eu não tinha visto** — o bloco de prova no
-- fim deste arquivo reprovou a migration e nomeou a policy. É a segunda vez hoje que
-- uma guarda pega a minha varredura incompleta, e é o motivo de ela existir: o meu
-- erro recorrente é tratar um de dois lugares.
--
-- A leitura continua do Financeiro (é configuração dele). Compras **não** precisa ler
-- o modo: ela sente o efeito pelo trigger `compras_respeita_teto`, que já lê os dois.
drop policy if exists "managers write budget settings" on public.fin_budget_settings;
create policy "fin_budget_settings_escreve_o_financeiro" on public.fin_budget_settings
  for all using (
    tenant_id = (select public.get_user_tenant_id())
    and (select public.has_fin_access(auth.uid()))
    and ((select public.is_manager_or_higher(auth.uid()))
         or (select public.tem_permissao(auth.uid(), 'financeiro', 'budgets', 'manage')))
  ) with check (
    tenant_id = (select public.get_user_tenant_id())
    and (select public.has_fin_access(auth.uid()))
    and ((select public.is_manager_or_higher(auth.uid()))
         or (select public.tem_permissao(auth.uid(), 'financeiro', 'budgets', 'manage')))
  );

-- ── 6. A lista de módulos ganha uma fechadura ────────────────────────────────
--
-- ACHADO AO FAZER ISTO, e vale mais registrado que consertado em silêncio:
-- `user_module_access.module` é **texto livre**, sem CHECK nenhum. Conceder
-- `'compas'` (com um "r" a menos) gravaria a linha e não daria acesso a nada —
-- `has_compras_access` procura `'compras'` e não acharia. Sintoma: a pessoa aparece
-- com o módulo concedido na tela de administração e continua sem ver a tela. **Zero
-- erro, zero aviso**, e a família é a mesma de "sem dado virando zero".
--
-- (E `plan_config`, que `docs/nao-funciona.md` citava como a lista de módulos
-- disponíveis, **não existe mais**: saiu com a camada SaaS na ADR-010. Hoje a lista
-- vive só em `ALL_MODULES`, no front, travada por `src/types/modulos.test.ts`. Este
-- CHECK é o lado do banco dela.)
--
-- Doze valores: os onze de `ALL_MODULES` mais `compras`. Quem acrescentar módulo
-- mexe aqui e lá — e é o teste do front que avisa, do mesmo jeito que a lista de
-- setores funciona desde a leva I.
alter table public.user_module_access drop constraint if exists user_module_access_module_conhecido;
alter table public.user_module_access add constraint user_module_access_module_conhecido
  check (module = any (array[
    'ti', 'crm', 'comercial', 'marketing', 'rh', 'financeiro',
    'producao', 'expedicao', 'educacional', 'qualidade', 'diretoria',
    'compras'
  ]));

-- ── 7. A prova de que nada ficou apontando para a permissão antiga ───────────
do $$
declare v_sobrou text;
begin
  select string_agg(distinct policyname || ' em ' || tablename, ', ') into v_sobrou
    from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') || coalesce(with_check, '')) like '%''purchases''%';

  if v_sobrou is not null then
    raise exception 'ainda ha policy usando a permissao financeiro:purchases: % — a troca ficou incompleta', v_sobrou;
  end if;
end $$;
