-- FINANCEIRO OBEDECE AO PERFIL, NO BANCO (decisão do dono, 2026-10-02 — "tudo, inclusive o banco").
--
-- Até aqui `fin_entries` abria inteira (ver, lançar, editar, apagar) para quem tinha o módulo
-- Financeiro, qualquer que fosse o perfil. A tela passou a obedecer às caixinhas em 20261123020000;
-- aqui o banco faz o mesmo, como o RH (`pode_no_rh`, 20261119020000):
--   * conta a PAGAR segue "Contas a Pagar"; conta a RECEBER segue "Contas a Receber";
--   * ver: a caixinha "Ver" do tipo — ou "Fluxo de Caixa"/"Indicadores", que somam os dois tipos;
--   * lançar: "Criar"; alterar: "Editar", "Baixar" ou "Aprovar pagamento"; apagar: "Excluir";
--   * dono e administrador passam (como em `tem_permissao`).
-- As escritas do sistema (compra concluída vira conta a pagar, automação, painel da Diretoria) são
-- funções `security definer` e não passam por aqui.

-- Os perfis do Financeiro com as caixinhas preenchidas (as de 20261123020000), por empresa — para a
-- empresa nova também nascer com elas (antes o Gestor nascia sem Contas a pagar e, com a regra
-- valendo, ninguém do setor veria uma conta).
create or replace function public.completar_perfis_do_financeiro(p_tenant uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.access_profiles set permissions = permissions || jsonb_build_object(
       'payables', '{"view":true,"create":true,"edit":true,"delete":true,"import":true,"settle":true,"approve_payment":true,"export":true}'::jsonb,
       'receivables', '{"view":true,"create":true,"edit":true,"delete":true,"import":true,"settle":true,"export":true}'::jsonb,
       'cashflow', '{"view":true,"export":true}'::jsonb)
   where tenant_id = p_tenant and department = 'financeiro' and name = 'Gestor' and not (permissions ? 'payables');
  update public.access_profiles set permissions = permissions || jsonb_build_object(
       'payables', '{"view":true,"create":true,"edit":true,"delete":false,"import":false,"settle":true,"approve_payment":false,"export":false}'::jsonb,
       'receivables', '{"view":true,"create":true,"edit":true,"delete":false,"import":false,"settle":true,"export":false}'::jsonb,
       'cashflow', '{"view":true,"export":false}'::jsonb)
   where tenant_id = p_tenant and department = 'financeiro' and name = 'Operador' and not (permissions ? 'payables');
  update public.access_profiles set permissions = permissions || jsonb_build_object(
       'payables', '{"view":true}'::jsonb, 'receivables', '{"view":true}'::jsonb, 'cashflow', '{"view":true}'::jsonb)
   where tenant_id = p_tenant and department = 'financeiro' and name = 'Somente leitura' and not (permissions ? 'payables');
  update public.access_profiles
     set permissions = jsonb_set(permissions, '{vendas}', coalesce(permissions->'vendas', '{}'::jsonb) || '{"view":true}'::jsonb)
   where tenant_id = p_tenant and department = 'comercial' and name in ('Gestor', 'Operador', 'Somente leitura')
     and coalesce((permissions->'vendas'->>'view')::boolean, false) = false;
$$;
revoke all on function public.completar_perfis_do_financeiro(uuid) from public, anon, authenticated;

create or replace function public.seed_default_categories_novos_modulos()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare d text;
begin
  perform public.seed_categorias_comercial_educacional(new.id);
  perform public.seed_categorias_expedicao_producao(new.id);
  foreach d in array array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional',
                           'expedicao', 'producao'] loop
    perform public.seed_default_access_profiles(new.id, d);
  end loop;
  perform public.completar_perfis_do_financeiro(new.id);
  -- LEVA P: Compras ganhou perfis. Função própria porque as chaves do esquema de Compras não
  -- têm fila de chamados nem configurações, e nenhum ramo de `seed_default_access_profiles` serve.
  perform public.seed_perfis_de_compras(new.id);
  return new;
end;
$function$;

do $$
declare t record;
begin
  for t in select id from public.tenants loop
    perform public.completar_perfis_do_financeiro(t.id);
  end loop;
end $$;

create or replace function public.pode_no_financeiro(p_kind text, p_acao text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin_or_higher(auth.uid())
      or public.tem_permissao(auth.uid(), 'financeiro',
           case p_kind when 'payable' then 'payables' else 'receivables' end, p_acao);
$$;
revoke all on function public.pode_no_financeiro(text, text) from public, anon;
grant execute on function public.pode_no_financeiro(text, text) to authenticated;

drop policy if exists fin_entries_select on public.fin_entries;
create policy fin_entries_select on public.fin_entries
  for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (public.pode_no_financeiro(kind, 'view')
              or (select public.tem_permissao(auth.uid(), 'financeiro', 'cashflow', 'view'))
              or (select public.tem_permissao(auth.uid(), 'financeiro', 'reports', 'view'))));

drop policy if exists fin_entries_insert on public.fin_entries;
create policy fin_entries_insert on public.fin_entries
  for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and (public.pode_no_financeiro(kind, 'create') or public.pode_no_financeiro(kind, 'import')));

-- Lição 15: o `with check` repete a permissão — senão trocar o tipo da conta abriria a porta.
drop policy if exists fin_entries_update on public.fin_entries;
create policy fin_entries_update on public.fin_entries
  for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (public.pode_no_financeiro(kind, 'edit') or public.pode_no_financeiro(kind, 'settle')
              or public.pode_no_financeiro(kind, 'approve_payment')))
  with check (tenant_id = (select public.get_user_tenant_id())
              and (public.pode_no_financeiro(kind, 'edit') or public.pode_no_financeiro(kind, 'settle')
                   or public.pode_no_financeiro(kind, 'approve_payment')));

drop policy if exists fin_entries_delete on public.fin_entries;
create policy fin_entries_delete on public.fin_entries
  for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_financeiro(kind, 'delete'));
