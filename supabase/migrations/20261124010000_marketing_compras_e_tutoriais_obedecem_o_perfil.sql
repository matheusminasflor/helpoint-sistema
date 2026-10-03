-- MARKETING, COMPRAS, FORNECEDORES E TUTORIAIS OBEDECEM AO PERFIL, NO BANCO (decisão do dono,
-- 2026-10-02: "escrever pelo perfil, ler só o necessário"). Mesma régua da TI (20261123040000).
--
-- Até aqui o banco decidia pelo CARGO: qualquer "member" da empresa criava post, item do
-- inventário do Marketing e fornecedor; qualquer supervisor editava tutorial; e na compra, quem
-- tivesse o módulo aprovava e executava — e quem PEDIU a compra podia aprová-la sozinho pela API
-- (a policy de UPDATE só perguntava "é sua?"). A tela escondia os botões; o banco não.
--
-- Exceções de leitura que o dono manteve abertas para a empresa toda:
--   * fornecedores (o nome aparece na compra e na conta a pagar);
--   * catálogo de produtos de compra (quem pede compra escolhe dele);
--   * tutoriais publicados (a visibilidade que cada tutorial já define continua valendo).
--
-- Medido na produção antes: as nove tabelas estão vazias; Compras não tem ninguém além do dono;
-- no Marketing só Gislene e Merilyn, Operadoras, que continuam fazendo o que fazem hoje.

-- ─── Marketing: as caixinhas que faltavam ────────────────────────────────────
-- Gestor e Somente leitura nasceram sem Cotações e UGC (o Operador tinha). Sem isso o Gestor
-- ficaria abaixo do Operador.
update public.access_profiles
   set permissions = permissions
     || jsonb_build_object('quotations', '{"view":true,"create":true,"edit":true,"delete":true,"approve":true}'::jsonb)
     || jsonb_build_object('ugc', '{"view":true,"create":true,"edit":true,"delete":true,"approve":true}'::jsonb)
 where department = 'marketing' and name = 'Gestor';
update public.access_profiles
   set permissions = permissions
     || jsonb_build_object('quotations', '{"view":true}'::jsonb)
     || jsonb_build_object('ugc', '{"view":true}'::jsonb)
 where department = 'marketing' and name = 'Somente leitura';

-- ─── Calendário de redes sociais ─────────────────────────────────────────────
-- `mkt-meta-publish` grava o post com o token de quem clicou: publicar é "editar" ou "Publicar".
drop policy if exists "Users can view social posts in their tenant" on public.mkt_social_posts;
drop policy if exists "Members can create social posts" on public.mkt_social_posts;
drop policy if exists "Members can update social posts" on public.mkt_social_posts;
drop policy if exists "Managers can delete social posts" on public.mkt_social_posts;
create policy mkt_social_posts_select on public.mkt_social_posts for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'calendar', 'view')));
create policy mkt_social_posts_insert on public.mkt_social_posts for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'calendar', 'create')));
create policy mkt_social_posts_update on public.mkt_social_posts for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'calendar', 'edit')) or (select public.pode_no_setor('marketing', 'calendar', 'publish'))))
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.pode_no_setor('marketing', 'calendar', 'edit')) or (select public.pode_no_setor('marketing', 'calendar', 'publish'))));
create policy mkt_social_posts_delete on public.mkt_social_posts for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'calendar', 'delete')));

-- ─── Inventário do Marketing ─────────────────────────────────────────────────
drop policy if exists mkt_assets_tenant_select on public.mkt_assets;
drop policy if exists mkt_assets_tenant_insert on public.mkt_assets;
drop policy if exists mkt_assets_tenant_update on public.mkt_assets;
drop policy if exists mkt_assets_tenant_delete on public.mkt_assets;
create policy mkt_assets_select on public.mkt_assets for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'inventory', 'view')));
create policy mkt_assets_insert on public.mkt_assets for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'inventory', 'create')));
create policy mkt_assets_update on public.mkt_assets for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'inventory', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'inventory', 'edit')));
create policy mkt_assets_delete on public.mkt_assets for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'inventory', 'delete')));

-- ─── Cotações, eventos e criativos de IA do Marketing ────────────────────────
-- ponytail: nenhuma tela usa estas três tabelas hoje (os hooks existem, as telas não). Ficam
-- presas à seção mais próxima do perfil — Cotações, Campanhas e Calendário — para não serem a
-- porta lateral aberta à empresa toda. Quando ganharem tela, a seção já está certa ou se troca aqui.
drop policy if exists "Users can view quotations in their tenant" on public.mkt_quotations;
drop policy if exists "Members can create quotations" on public.mkt_quotations;
drop policy if exists "Members can update quotations" on public.mkt_quotations;
drop policy if exists "Managers can delete quotations" on public.mkt_quotations;
create policy mkt_quotations_select on public.mkt_quotations for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'quotations', 'view')));
create policy mkt_quotations_insert on public.mkt_quotations for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'quotations', 'create')));
create policy mkt_quotations_update on public.mkt_quotations for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'quotations', 'edit')) or (select public.pode_no_setor('marketing', 'quotations', 'approve'))))
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.pode_no_setor('marketing', 'quotations', 'edit')) or (select public.pode_no_setor('marketing', 'quotations', 'approve'))));
create policy mkt_quotations_delete on public.mkt_quotations for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'quotations', 'delete')));

drop policy if exists "Users can view events in their tenant" on public.mkt_events;
drop policy if exists "Members can create events" on public.mkt_events;
drop policy if exists "Members can update events" on public.mkt_events;
drop policy if exists "Managers can delete events" on public.mkt_events;
create policy mkt_events_select on public.mkt_events for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'campaigns', 'view')));
create policy mkt_events_insert on public.mkt_events for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'campaigns', 'create')));
create policy mkt_events_update on public.mkt_events for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'campaigns', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'campaigns', 'edit')));
create policy mkt_events_delete on public.mkt_events for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'campaigns', 'delete')));

drop policy if exists "Users can view AI generations in their tenant" on public.mkt_ai_generations;
drop policy if exists "Members can create AI generations" on public.mkt_ai_generations;
drop policy if exists "Members can update AI generations" on public.mkt_ai_generations;
create policy mkt_ai_generations_select on public.mkt_ai_generations for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'calendar', 'view')));
create policy mkt_ai_generations_insert on public.mkt_ai_generations for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'calendar', 'create')));
create policy mkt_ai_generations_update on public.mkt_ai_generations for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'calendar', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('marketing', 'calendar', 'edit')));

-- ─── Fornecedores (Marketing e Compras; o Financeiro cadastra na hora de lançar a conta) ──
-- Ler continua aberto à empresa (exceção do dono). `SeletorFornecedor`, na conta a pagar, cria
-- fornecedor novo sem sair do lançamento — por isso "lançar conta a pagar" também cadastra.
drop policy if exists "Quem trabalha aqui cadastra fornecedor" on public.suppliers;
drop policy if exists "Quem trabalha aqui corrige fornecedor" on public.suppliers;
drop policy if exists "Gestor apaga fornecedor" on public.suppliers;
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.pode_no_setor('marketing', 'suppliers', 'create'))
                   or (select public.pode_no_setor('compras', 'fornecedores', 'create'))
                   or (select public.pode_no_financeiro('payable', 'create'))));
create policy suppliers_update on public.suppliers for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'suppliers', 'edit')) or (select public.pode_no_setor('compras', 'fornecedores', 'edit'))))
  with check (tenant_id = (select public.get_user_tenant_id())
              and ((select public.pode_no_setor('marketing', 'suppliers', 'edit')) or (select public.pode_no_setor('compras', 'fornecedores', 'edit'))));
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.pode_no_setor('marketing', 'suppliers', 'delete')) or (select public.pode_no_setor('compras', 'fornecedores', 'delete'))));

-- ─── Catálogo de compras ─────────────────────────────────────────────────────
-- Ler continua aberto (quem pede compra escolhe do catálogo). A seção só tem "Criar e editar";
-- nenhuma tela exclui produto (desativa), então excluir fica com o administrador.
drop policy if exists compras_produtos_insert on public.compras_produtos;
drop policy if exists compras_produtos_update on public.compras_produtos;
drop policy if exists compras_produtos_delete on public.compras_produtos;
create policy compras_produtos_insert on public.compras_produtos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('compras', 'catalogo', 'edit')));
create policy compras_produtos_update on public.compras_produtos for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('compras', 'catalogo', 'edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('compras', 'catalogo', 'edit')));
create policy compras_produtos_delete on public.compras_produtos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.is_admin_or_higher(auth.uid())));

-- ─── Solicitações de compra ──────────────────────────────────────────────────
-- Quem vê todas: "Visualizar", "Aprovar" ou "Executar" de Compras, e quem baixa pagamento no
-- Financeiro (ele executa compra — `PurchasePanel`, `canExecute`). Quem pediu vê a própria.
create or replace function public.compras_ve_as_solicitacoes()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.pode_no_setor('compras', 'solicitacoes', 'view')
      or public.pode_no_setor('compras', 'solicitacoes', 'approve')
      or public.pode_no_setor('compras', 'solicitacoes', 'execute')
      or public.pode_no_financeiro('payable', 'settle');
$$;
revoke all on function public.compras_ve_as_solicitacoes() from public, anon;
grant execute on function public.compras_ve_as_solicitacoes() to authenticated;

drop policy if exists compras_solicitacoes_select on public.compras_solicitacoes;
drop policy if exists compras_solicitacoes_update on public.compras_solicitacoes;
drop policy if exists compras_solicitacoes_delete on public.compras_solicitacoes;
create policy compras_solicitacoes_select on public.compras_solicitacoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (created_by = auth.uid() or (select public.compras_ve_as_solicitacoes())));
create policy compras_solicitacoes_update on public.compras_solicitacoes for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (created_by = auth.uid() or (select public.compras_ve_as_solicitacoes())))
  with check (tenant_id = (select public.get_user_tenant_id())
              and (created_by = auth.uid() or (select public.compras_ve_as_solicitacoes())));
create policy compras_solicitacoes_delete on public.compras_solicitacoes for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.is_admin_or_higher(auth.uid())));

-- A policy deixa a linha ser tocada; QUEM muda o status é este guarda. Aprovar e recusar pedem
-- "Aprovar / reprovar compra"; concluir pede "Executar compra" ou "Baixar pagamento" — o mesmo
-- que a tela pergunta. Escrita de sistema (trigger, função definer, cron) passa.
create or replace function public.compras_guarda_o_status()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
begin
  if new.status is not distinct from old.status
     or pg_trigger_depth() > 1
     or current_user <> 'authenticated' then
    return new;
  end if;
  if new.status = 'completed' then
    if not (public.pode_no_setor('compras', 'solicitacoes', 'execute') or public.pode_no_financeiro('payable', 'settle')) then
      raise exception 'Executar compra pede a permissão "Executar compra" de Compras.' using errcode = '42501';
    end if;
  elsif not public.pode_no_setor('compras', 'solicitacoes', 'approve') then
    raise exception 'Aprovar ou recusar compra pede a permissão "Aprovar / reprovar compra" de Compras.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.compras_guarda_o_status() from public, anon;
drop trigger if exists trg_compras_guarda_o_status on public.compras_solicitacoes;
create trigger trg_compras_guarda_o_status before update of status on public.compras_solicitacoes
  for each row execute function public.compras_guarda_o_status();

-- Orçamentos: quem pediu continua gravando os da própria solicitação pendente
-- (`compras_orcamentos_quem_pediu_insere`); a equipe, pelo "Aprovar".
drop policy if exists compras_orcamentos_select on public.compras_orcamentos;
drop policy if exists compras_orcamentos_escreve on public.compras_orcamentos;
create policy compras_orcamentos_select on public.compras_orcamentos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.compras_ve_as_solicitacoes())
              or exists (select 1 from public.compras_solicitacoes r
                          where r.id = compras_orcamentos.request_id and r.tenant_id = compras_orcamentos.tenant_id
                            and r.created_by = auth.uid())));
create policy compras_orcamentos_escreve on public.compras_orcamentos for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('compras', 'solicitacoes', 'approve')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_no_setor('compras', 'solicitacoes', 'approve')));

-- ─── Tutoriais (POPs) ────────────────────────────────────────────────────────
-- Quem escreve: "Base de Conhecimento" da TI ou "POPs" da Qualidade (a tela é uma só, /ti/pops).
-- Rascunho (inativo) aparece para quem pode editar; publicado segue a visibilidade de cada um.
create or replace function public.pode_nos_tutoriais(p_acao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.pode_no_setor('ti', 'knowledge', p_acao) or public.pode_no_setor('qualidade', 'pops', p_acao);
$$;
revoke all on function public.pode_nos_tutoriais(text) from public, anon;
grant execute on function public.pode_nos_tutoriais(text) to authenticated;

drop policy if exists "Users can view visible POPs" on public.pops;
drop policy if exists "Supervisors can create POPs" on public.pops;
drop policy if exists "Supervisors can update POPs" on public.pops;
drop policy if exists "Directors can delete POPs" on public.pops;
create policy pops_select on public.pops for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (created_by = auth.uid()  -- o autor vê o rascunho que acabou de gravar (lições 11 e 13)
              or (select public.pode_nos_tutoriais('edit'))
              or (is_active = true
                  and (visibility_type = 'all'
                       or (visibility_type = 'viewers_only' and public.has_role(auth.uid(), 'viewer'::public.app_role))
                       or (visibility_type = 'departments'
                           and (select p.department from public.profiles p where p.id = auth.uid()) = any (visibility_departments))))));
create policy pops_insert on public.pops for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_nos_tutoriais('create')));
create policy pops_update on public.pops for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_nos_tutoriais('edit')))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_nos_tutoriais('edit')));
create policy pops_delete on public.pops for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.pode_nos_tutoriais('delete')));
