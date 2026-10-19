-- INATIVAR CARTEIRA (dono, 2026-10-19): "ter como editar nome da carteira, mover cliente de uma carteira para outra,
-- inativar carteiras". Renomear (`com_renomear_carteira`) e mover em lote (Cadastro dos clientes › Atribuir) já existiam.
-- Decisão (múltipla escolha): inativar PEDE A CARTEIRA DE DESTINO dos clientes dela; a carteira some das listas, filtros e
-- seletores (`com_carteiras_conhecidas`); vendas antigas e metas passadas ficam no histórico; dá para reativar.
--   * os clientes vão para o destino; as pessoas saem da carteira (deixam de ser vendedoras dela);
--   * a importação de clientes que ainda trouxer o nome antigo cai no destino (a memória de renomeações).
-- Quem pode: quem gere carteiras (`com_pode_gerir_carteiras`, a mesma régua de mover cliente de carteira).

create table if not exists public.com_carteiras_inativas (
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  carteira text not null,
  destino text,
  inativada_em timestamptz not null default now(),
  inativada_por uuid default auth.uid() references public.profiles(id) on delete set null,
  primary key (tenant_id, carteira)
);
alter table public.com_carteiras_inativas enable row level security;
-- Leitura para quem é da empresa; escrita só pelas duas funções abaixo.
create policy com_carteiras_inativas_le on public.com_carteiras_inativas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));

create or replace function public.com_carteiras_conhecidas()
returns table(carteira text) language sql stable set search_path = public as $$
  select c.carteira from (
    select mc.carteira from public.metas_carteira mc
    union
    select cm.carteira from public.com_metas cm where cm.carteira is not null
    union
    select cb.carteira from public.com_carteira_membros cb
  ) c
  where not exists (select 1 from public.com_carteiras_inativas i where i.carteira = c.carteira)
  order by 1;
$$;

create or replace function public.com_inativar_carteira(p_carteira text, p_destino text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := (select public.get_user_tenant_id());
  v_de   text := public.normalizar_nome_carteira(p_carteira);
  v_para text := nullif(public.normalizar_nome_carteira(p_destino), '');
  v_clientes int := 0;
  v_membros int := 0;
begin
  if not public.com_pode_gerir_carteiras() then
    raise exception 'Só quem gere as carteiras pode inativar uma carteira.' using errcode = '42501';
  end if;
  if v_de = '' then
    raise exception 'Nome de carteira vazio.' using errcode = '22023';
  end if;
  if exists (select 1 from public.com_carteiras_inativas where tenant_id = v_tenant and carteira = v_de) then
    raise exception 'A carteira % já está inativa.', v_de using errcode = '23505';
  end if;
  if v_para = v_de then
    raise exception 'Escolha outra carteira para receber os clientes.' using errcode = '22023';
  end if;
  if v_para is not null and exists (select 1 from public.com_carteiras_inativas where tenant_id = v_tenant and carteira = v_para) then
    raise exception 'A carteira % está inativa: escolha uma ativa para receber os clientes.', v_para using errcode = '22023';
  end if;
  if v_para is null and exists (select 1 from public.com_clientes where tenant_id = v_tenant and carteira = v_de) then
    raise exception 'A carteira % tem clientes: escolha para qual carteira eles vão.', v_de using errcode = '22023';
  end if;

  update public.com_clientes set carteira = v_para where tenant_id = v_tenant and carteira = v_de;
  get diagnostics v_clientes = row_count;
  delete from public.com_carteira_membros where tenant_id = v_tenant and carteira = v_de;
  get diagnostics v_membros = row_count;

  if v_para is not null then
    update public.com_carteira_renomeacoes set para = v_para where tenant_id = v_tenant and para = v_de;
    insert into public.com_carteira_renomeacoes (tenant_id, de, para) values (v_tenant, v_de, v_para)
    on conflict (tenant_id, de) do update set para = excluded.para;
  end if;

  insert into public.com_carteiras_inativas (tenant_id, carteira, destino) values (v_tenant, v_de, v_para);
  return jsonb_build_object('clientes', v_clientes, 'membros', v_membros);
end;
$$;
revoke all on function public.com_inativar_carteira(text, text) from public, anon;
grant execute on function public.com_inativar_carteira(text, text) to authenticated;

/** Reativar devolve a carteira às listas, vazia: os clientes ficam onde foram; quem responde se acrescenta de novo. */
create or replace function public.com_reativar_carteira(p_carteira text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := (select public.get_user_tenant_id());
  v_de text := public.normalizar_nome_carteira(p_carteira);
begin
  if not public.com_pode_gerir_carteiras() then
    raise exception 'Só quem gere as carteiras pode reativar uma carteira.' using errcode = '42501';
  end if;
  delete from public.com_carteiras_inativas where tenant_id = v_tenant and carteira = v_de;
  if not found then
    raise exception 'A carteira % não está inativa.', v_de using errcode = '22023';
  end if;
  delete from public.com_carteira_renomeacoes where tenant_id = v_tenant and de = v_de;
end;
$$;
revoke all on function public.com_reativar_carteira(text) from public, anon;
grant execute on function public.com_reativar_carteira(text) to authenticated;
