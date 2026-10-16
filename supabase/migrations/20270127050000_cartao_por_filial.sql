-- COMPRAS: UM CARTÃO POR FILIAL (dono, 2026-10-16): "a MF tem 1 cartão e a INBRAS 1, e os fechamentos e datas são
-- diferentes". Os dias que já existiam (`cartao_fecha_dia`/`cartao_vence_dia`) passam a ser os do cartão da INBRAS; o da
-- MF ganha os seus. A conta da compra no cartão vence na fatura do cartão da filial da compra. Sem os dias da MF, a MF usa
-- os da INBRAS (era assim até hoje).

alter table public.compras_config
  add column if not exists cartao_mf_fecha_dia smallint check (cartao_mf_fecha_dia between 1 and 28),
  add column if not exists cartao_mf_vence_dia smallint check (cartao_mf_vence_dia between 1 and 28);

create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

-- A da filial: a MF com os seus dias, se cadastrados; senão (INBRAS, filial vazia, MF sem dias) a de antes.
create or replace function public.vencimento_da_fatura(p_tenant uuid, p_dia date, p_parcela integer, p_filial text)
returns date language plpgsql stable security definer set search_path = public as $$
declare
  v_fecha int;
  v_vence int;
  v_fechamento date;
begin
  if p_filial is distinct from 'MF' then
    return public.vencimento_da_fatura(p_tenant, p_dia, p_parcela);
  end if;
  select cartao_mf_fecha_dia, cartao_mf_vence_dia into v_fecha, v_vence from public.compras_config where tenant_id = p_tenant;
  if v_fecha is null or v_vence is null then
    return public.vencimento_da_fatura(p_tenant, p_dia, p_parcela);
  end if;
  v_fechamento := make_date(extract(year from p_dia)::int, extract(month from p_dia)::int, v_fecha);
  if p_dia >= v_fechamento then
    v_fechamento := (v_fechamento + interval '1 month')::date;
  end if;
  v_fechamento := (v_fechamento + make_interval(months => p_parcela - 1))::date;
  return case when v_vence > v_fecha
              then make_date(extract(year from v_fechamento)::int, extract(month from v_fechamento)::int, v_vence)
              else (make_date(extract(year from v_fechamento)::int, extract(month from v_fechamento)::int, v_vence) + interval '1 month')::date
         end;
end;
$$;
revoke all on function public.vencimento_da_fatura(uuid, date, integer, text) from public, anon;
grant execute on function public.vencimento_da_fatura(uuid, date, integer, text) to authenticated;

select pg_temp.troca('public.compras_vira_conta_a_pagar()'::regprocedure,
$$public.vencimento_da_fatura(new.tenant_id, v_hoje, i)$$,
$$public.vencimento_da_fatura(new.tenant_id, v_hoje, i, new.filial)$$);
