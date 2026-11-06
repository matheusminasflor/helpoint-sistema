-- A troca de tabela chega ao sistema na importação de sexta, mas pode ter valido antes (dono, 2026-11-06). Quem corrige
-- lançamento acerta o dia na ficha do cliente, e a Venda total se ajusta. A primeira tabela vale desde sempre: não tem dia.
create or replace function public.com_corrigir_data_da_tabela(p_id uuid, p_data date)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_linha public.com_clientes_tabela_historico%rowtype;
  v_antes date;
  v_depois date;
begin
  if not public.com_pode_corrigir_lancamento() then
    raise exception 'Só quem corrige lançamento acerta a data da tabela.' using errcode = '42501';
  end if;
  select * into v_linha from public.com_clientes_tabela_historico h where h.id = p_id and h.tenant_id = v_tenant;
  if v_linha.id is null then
    raise exception 'Troca de tabela não encontrada.' using errcode = 'P0002';
  end if;
  select max(h.vigente_desde) filter (where (h.vigente_desde, h.created_at) < (v_linha.vigente_desde, v_linha.created_at)),
         min(h.vigente_desde) filter (where (h.vigente_desde, h.created_at) > (v_linha.vigente_desde, v_linha.created_at))
    into v_antes, v_depois
    from public.com_clientes_tabela_historico h
   where h.tenant_id = v_tenant and h.cliente_codigo = v_linha.cliente_codigo;
  if v_antes is null then
    raise exception 'A primeira tabela do cliente vale desde sempre.' using errcode = '22023';
  end if;
  if p_data is null or p_data <= v_antes or p_data > coalesce(v_depois - 1, (now() at time zone 'America/Sao_Paulo')::date) then
    raise exception 'A data precisa ficar depois da tabela anterior, antes da seguinte e não pode ser futura.' using errcode = '22023';
  end if;
  update public.com_clientes_tabela_historico h set vigente_desde = p_data where h.id = p_id;
  update public.com_clientes c set periodos_condicao = public.com_periodos_da_condicao(v_tenant, v_linha.cliente_codigo)
   where c.tenant_id = v_tenant and c.codigo = v_linha.cliente_codigo;
end;
$$;

revoke all on function public.com_corrigir_data_da_tabela(uuid, date) from public, anon;
grant execute on function public.com_corrigir_data_da_tabela(uuid, date) to authenticated;
