-- CORRIGIR E APAGAR LANÇAMENTO VIRAM CAIXINHAS DO PERFIL (decisão do dono, 2026-10-02).
--
-- A migration 20261120010000 travou o lançamento salvo para a vendedora e deixou a correção com
-- `com_pode_gerir_carteiras` — escondida na caixinha "Carteiras: montar carteiras…". O dono quer
-- marcar no perfil, separado: "Corrigir lançamento já salvo" e "Apagar lançamento". O administrador
-- sempre pode; o perfil Gestor do Comercial nasce com as duas; Operador e Somente leitura, sem.

create or replace function public.com_pode_corrigir_lancamento()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'comercial', 'lancamentos', 'corrigir'), false);
$$;

create or replace function public.com_pode_apagar_lancamento()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'comercial', 'lancamentos', 'apagar'), false);
$$;

-- Lição 14: função nova nasce executável por PUBLIC.
revoke all on function public.com_pode_corrigir_lancamento() from public, anon;
grant execute on function public.com_pode_corrigir_lancamento() to authenticated;
revoke all on function public.com_pode_apagar_lancamento() from public, anon;
grant execute on function public.com_pode_apagar_lancamento() to authenticated;

-- As travas deixam passar quem corrige (antes: quem gere carteiras).
create or replace function public.com_interacao_salva_nao_muda()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' or pg_trigger_depth() > 1 or auth.uid() is null
     or public.com_pode_corrigir_lancamento() then
    return new;
  end if;
  if new.cliente_codigo is distinct from old.cliente_codigo
     or new.data is distinct from old.data
     or new.fora_da_carteira is distinct from old.fora_da_carteira then
    raise exception 'Lançamento salvo não muda de cliente nem de data. Novo contato é um lançamento novo; erro, peça ao gestor.'
      using errcode = '42501';
  end if;
  if old.status = 'concluido'
     and (new.status is distinct from old.status
          or new.valor_venda is distinct from old.valor_venda
          or new.prazo is distinct from old.prazo
          or new.observacoes is distinct from old.observacoes) then
    raise exception 'Lançamento concluído não se altera. Erro, peça ao gestor.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.com_marca_salva_nao_muda()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' or pg_trigger_depth() > 1 or auth.uid() is null
     or public.com_pode_corrigir_lancamento() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.interacao_id::text = coalesce(current_setting('helpoint.lancamento_novo', true), '')
       or exists (select 1 from public.com_interacao_marcas m
                   where m.interacao_id = new.interacao_id and m.indicador_id = new.indicador_id) then
      return new;
    end if;
  end if;
  raise exception 'Indicadores e ações de um lançamento salvo não mudam. Novo contato é um lançamento novo; erro, peça ao gestor.'
    using errcode = '42501';
end;
$$;

-- As portas de escrita de quem corrige. O `with check` repete a permissão (lição 15).
drop policy if exists com_interacoes_update_gestor on public.com_interacoes;
create policy com_interacoes_update_gestor on public.com_interacoes
  for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_corrigir_lancamento()))
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_corrigir_lancamento()));

drop policy if exists com_interacao_marcas_insert_gestor on public.com_interacao_marcas;
create policy com_interacao_marcas_insert_gestor on public.com_interacao_marcas
  for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and (select public.com_pode_corrigir_lancamento())
              and exists (select 1 from public.com_interacoes i
                           where i.id = com_interacao_marcas.interacao_id and i.tenant_id = com_interacao_marcas.tenant_id));

-- Desmarcar: a dona da linha passa pela policy, mas a trava acima a barra; quem corrige, passa.
drop policy if exists com_interacao_marcas_delete on public.com_interacao_marcas;
create policy com_interacao_marcas_delete on public.com_interacao_marcas
  for delete to authenticated
  using (exists (select 1 from public.com_interacoes i
                  where i.id = com_interacao_marcas.interacao_id
                    and (i.vendedor_id = auth.uid() or (select public.com_pode_corrigir_lancamento()))));

drop policy if exists com_interacoes_delete on public.com_interacoes;
create policy com_interacoes_delete on public.com_interacoes
  for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (select public.com_pode_apagar_lancamento()));

-- O Gestor do Comercial nasce com as duas. ponytail: só os perfis que existem, como em
-- 20261119050000 — a semente de empresa nova não ganha a chave (ADR-010, uma empresa só).
update public.access_profiles
   set permissions = jsonb_set(permissions, '{lancamentos}', '{"corrigir": true, "apagar": true}'::jsonb)
 where department = 'comercial' and name = 'Gestor';
